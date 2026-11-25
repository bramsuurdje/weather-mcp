import { createMcpHandler, McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { planDryWindows } from "./dry-window";
import { WeatherInputError } from "./errors";
import {
  AirQualitySchema,
  ComparisonSchema,
  DryWindowsSchema,
  ForecastSchema,
  SunTimesSchema,
  UnitsSchema,
  unitLabels,
  type Forecast,
  type Location,
} from "./forecast";
import { getAirQuality, getForecast, getOutlook, getSunTimes } from "./open-meteo";

const PORT = 5230;
const VIEW_URI = "ui://weather/forecast.html";

// Bundle the widget once at startup and inline it into a single HTML document,
// since hosts render the resource in a sandboxed iframe with no access to our server.
async function buildViewHtml(): Promise<string> {
  const build = await Bun.build({
    entrypoints: [`${import.meta.dir}/view/view.ts`],
    target: "browser",
    minify: true,
  });
  const [bundle] = build.outputs;
  if (!build.success || !bundle) throw new AggregateError(build.logs, "Widget build failed");
  const script = (await bundle.text()).replaceAll("</script", "<\\/script");
  const template = await Bun.file(`${import.meta.dir}/view/view.html`).text();
  return template.replace("<!-- SCRIPT -->", () => `<script type="module">${script}</script>`);
}

const viewHtml = await buildViewHtml();

// ---------- Shared tool pieces ----------

const city = z.string().min(1).describe("City name only, e.g. 'Leeuwarden' or 'New York'");
const countryCode = z
  .string()
  .length(2)
  .optional()
  .describe("ISO 3166-1 alpha-2 country code to disambiguate, e.g. 'NL'");
const units = UnitsSchema.default("metric").describe("metric (°C, km/h) or imperial (°F, mph)");

// Every tool only reads public weather data and draws the same widget.
const annotations = { readOnlyHint: true, openWorldHint: true };
const _meta = { ui: { resourceUri: VIEW_URI } };

const CARD_NOTE = "This is shown to the user as an interactive card; do not repeat all the numbers.";

const placeName = (l: Location) => [l.name, l.region, l.country].filter(Boolean).join(", ");

/** Runs a tool body, turning input problems into an error result the model can act on. */
async function answer(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (!(error instanceof WeatherInputError)) throw error;
    return { isError: true, content: [{ type: "text", text: error.message }] };
  }
}

/** A tool result: a short text for the model next to the data the widget draws. */
const card = (text: string, structuredContent: Record<string, unknown>): CallToolResult => ({
  content: [{ type: "text", text: `${text} ${CARD_NOTE}` }],
  structuredContent,
});

function describeForecast(f: Forecast): string {
  const u = unitLabels[f.units];
  const today = f.daily[0];
  return [
    `${placeName(f.location)}: ${f.current.description}, ${f.current.temperature}${u.temperature} (feels like ${f.current.feelsLike}${u.temperature}),`,
    `wind ${f.current.windSpeed} ${u.wind}, humidity ${f.current.humidity}%.`,
    today && `Today ${today.min}–${today.max}${u.temperature}, ${today.precipitationChance}% chance of precipitation.`,
  ]
    .filter(Boolean)
    .join(" ");
}

// ---------- Server ----------

function createServer(): McpServer {
  const server = new McpServer({ name: "group9-weather", version: "2.0.0" });

  registerAppTool(
    server,
    "show_weather",
    {
      title: "Show weather",
      description:
        "Show the current weather, the next 24 hours and a 7-day forecast for one city as a visual card. Use for any question about weather, temperature, rain, wind or what to wear.",
      inputSchema: z.object({ city, countryCode, units }),
      outputSchema: ForecastSchema,
      annotations,
      _meta,
    },
    (args) =>
      answer(async () => {
        const forecast = await getForecast(args);
        return card(describeForecast(forecast), forecast);
      }),
  );

  registerAppTool(
    server,
    "find_dry_window",
    {
      title: "Find a dry window",
      description:
        "Find the best dry time slot for doing something outside in a city: a walk, bike ride, run, barbecue or hanging out the laundry. Use when the user asks when to do something or when it will be dry, not for a general forecast.",
      inputSchema: z.object({
        city,
        countryCode,
        hours: z.number().int().min(1).max(12).describe("How many hours in a row the activity needs"),
        startDate: z.iso
          .date()
          .optional()
          .describe("First day to search, YYYY-MM-DD in the city's local time. Leave out to search today and the next two days."),
        endDate: z.iso
          .date()
          .optional()
          .describe("Last day to search, YYYY-MM-DD. Needs startDate. Leave out to search only startDate."),
        earliestHour: z.number().int().min(0).max(23).default(7).describe("The activity may not start before this hour of the day (0-23)"),
        latestHour: z.number().int().min(1).max(24).default(22).describe("The activity must be over by this hour of the day (1-24)"),
        units,
      }),
      outputSchema: DryWindowsSchema,
      annotations,
      _meta,
    },
    ({ hours, ...args }) =>
      answer(async () => {
        if (args.endDate && !args.startDate) throw new WeatherInputError("endDate needs a startDate.");
        const plan = planDryWindows(await getOutlook(args), { ...args, hoursNeeded: hours });
        const u = unitLabels[plan.units];
        const [best, ...others] = plan.windows.map(
          (w) =>
            `${w.start.replace("T", " ")}–${w.end.slice(11)} (rain chance up to ${w.precipitationChance}%, feels like ${w.feelsLike}${u.temperature})`,
        );
        return card(
          `Best ${hours}-hour dry window in ${placeName(plan.location)}, local time: ${best}.` +
            (others.length ? ` Alternatives: ${others.join("; ")}.` : ""),
          plan,
        );
      }),
  );

  registerAppTool(
    server,
    "compare_weather",
    {
      title: "Compare weather",
      description:
        "Compare the current weather in 2 to 4 cities side by side. Use when the user names several places, or asks where it is warmer, drier or nicer.",
      inputSchema: z.object({
        cities: z.array(z.object({ city, countryCode })).min(2).max(4).describe("The cities to compare"),
        units,
      }),
      outputSchema: ComparisonSchema,
      annotations,
      _meta,
    },
    (args) =>
      answer(async () => {
        const places = await Promise.all(args.cities.map((place) => getForecast({ ...place, units: args.units })));
        return card(places.map(describeForecast).join("\n"), { kind: "comparison", units: args.units, places });
      }),
  );

  registerAppTool(
    server,
    "air_quality",
    {
      title: "Air quality",
      description:
        "Show the air quality (European AQI, PM2.5, PM10, NO2, ozone), UV index and pollen for a city, now and for the next 24 hours. Use for questions about smog, pollution, hay fever, sunscreen, or whether it is healthy to exercise outside.",
      inputSchema: z.object({ city, countryCode }),
      outputSchema: AirQualitySchema,
      annotations,
      _meta,
    },
    (args) =>
      answer(async () => {
        const air = await getAirQuality(args);
        const pollen = air.pollen.filter((p) => p.grains > 0).map((p) => `${p.name} ${p.grains}`);
        return card(
          [
            `Air quality in ${placeName(air.location)}: European AQI ${air.index} (${air.level.replace("-", " ")}), UV index ${air.uvIndex}.`,
            air.pollutants.map((p) => `${p.name} ${p.value} μg/m³ (${p.level.replace("-", " ")})`).join(", ") + ".",
            air.pollen.length === 0
              ? "No pollen forecast for this location."
              : `Pollen (grains/m³): ${pollen.length ? pollen.join(", ") : "none in the air"}.`,
          ].join(" "),
          air,
        );
      }),
  );

  registerAppTool(
    server,
    "sun_times",
    {
      title: "Sun times",
      description:
        "Show sunrise, sunset, day length and golden hour for a city, for today and the next six days. Use for questions about daylight, when it gets dark, or the best light for photos.",
      inputSchema: z.object({ city, countryCode }),
      outputSchema: SunTimesSchema,
      annotations,
      _meta,
    },
    (args) =>
      answer(async () => {
        const sun = await getSunTimes(args);
        const [today] = sun.days;
        if (!today) throw new Error("Open-Meteo returned no days");
        const minutes = Math.round(today.daylightSeconds / 60);
        const change = Math.round(today.changeSeconds / 60);
        return card(
          `Sun in ${placeName(sun.location)} today, local time: sunrise ${today.sunrise.slice(11)}, sunset ${today.sunset.slice(11)}, ` +
            `${Math.floor(minutes / 60)}h ${minutes % 60}m of daylight (${change >= 0 ? "+" : ""}${change} min compared to yesterday). It is now ${sun.now.slice(11)}.`,
          sun,
        );
      }),
  );

  registerAppResource(server, "Weather card", VIEW_URI, {}, async () => ({
    contents: [{ uri: VIEW_URI, mimeType: RESOURCE_MIME_TYPE, text: viewHtml }],
  }));

  return server;
}

const mcp = createMcpHandler(createServer);

Bun.serve({
  port: PORT,
  routes: {
    "/mcp": (req) => mcp.fetch(req),
    "/": () => new Response("Group 9 weather MCP server. Connect to /mcp"),
  },
});

console.log(`Weather MCP listening on http://localhost:${PORT}/mcp`);
