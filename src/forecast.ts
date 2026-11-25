import { z } from "zod";

// The contract between the MCP tools and the widget. Each tool returns one of these
// as `structuredContent`, tagged with `kind`; the widget parses it with the same schemas.

export const ConditionSchema = z.enum([
  "clear",
  "partly-cloudy",
  "cloudy",
  "fog",
  "drizzle",
  "rain",
  "snow",
  "thunder",
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const UnitsSchema = z.enum(["metric", "imperial"]);
export type Units = z.infer<typeof UnitsSchema>;

// Times are local wall-clock ISO strings for the location ("2026-11-25T13:45"), no offset.
const LocalTime = z.string();

/** Adds hours to a local time ("2026-11-25T23:00" + 1 → "2026-11-26T00:00"). */
export const addHours = (time: string, hours: number) =>
  new Date(new Date(`${time}Z`).getTime() + hours * 3_600_000).toISOString().slice(0, 16);

const LocationSchema = z.object({
  name: z.string(),
  region: z.string().optional(),
  country: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  timezone: z.string(),
});
export type Location = z.infer<typeof LocationSchema>;

/** Output of `show_weather`. */
export const ForecastSchema = z.object({
  kind: z.literal("forecast"),
  location: LocationSchema,
  units: UnitsSchema,
  current: z.object({
    time: LocalTime,
    temperature: z.number(),
    feelsLike: z.number(),
    humidity: z.number(),
    windSpeed: z.number(),
    windDirection: z.number(),
    precipitation: z.number(),
    condition: ConditionSchema,
    description: z.string(),
    isDay: z.boolean(),
  }),
  hourly: z.array(
    z.object({
      time: LocalTime,
      temperature: z.number(),
      precipitationChance: z.number(),
      condition: ConditionSchema,
      isDay: z.boolean(),
    }),
  ),
  daily: z.array(
    z.object({
      date: z.string(),
      min: z.number(),
      max: z.number(),
      precipitationChance: z.number(),
      condition: ConditionSchema,
      description: z.string(),
      sunrise: LocalTime,
      sunset: LocalTime,
    }),
  ),
});
export type Forecast = z.infer<typeof ForecastSchema>;

const DryWindowSchema = z.object({
  start: LocalTime,
  end: LocalTime,
  /** The highest rain chance of any hour in the window. */
  precipitationChance: z.number(),
  /** Total expected precipitation over the window. */
  precipitation: z.number(),
  /** Average feels-like temperature over the window. */
  feelsLike: z.number(),
  condition: ConditionSchema,
  isDay: z.boolean(),
});

const OutlookHourSchema = z.object({
  time: LocalTime,
  feelsLike: z.number(),
  precipitationChance: z.number(),
  precipitation: z.number(),
  condition: ConditionSchema,
  isDay: z.boolean(),
});
export type OutlookHour = z.infer<typeof OutlookHourSchema>;

/** Output of `find_dry_window`. */
export const DryWindowsSchema = z.object({
  kind: z.literal("dry-windows"),
  location: LocationSchema,
  units: UnitsSchema,
  now: LocalTime,
  hoursNeeded: z.number(),
  earliestHour: z.number(),
  latestHour: z.number(),
  // Every searched day, with its hours between earliestHour and latestHour.
  days: z.array(z.object({ date: z.string(), hours: z.array(OutlookHourSchema) })),
  // Best first, never overlapping. There is always at least one.
  windows: z.tuple([DryWindowSchema], DryWindowSchema),
});
export type DryWindows = z.infer<typeof DryWindowsSchema>;
export type DryWindow = z.infer<typeof DryWindowSchema>;

/** Output of `compare_weather`: one full forecast per city, in the order asked. */
export const ComparisonSchema = z.object({
  kind: z.literal("comparison"),
  units: UnitsSchema,
  places: z.array(ForecastSchema),
});
export type Comparison = z.infer<typeof ComparisonSchema>;

// The six bands of the European Air Quality Index, best first.
export const AirLevelSchema = z.enum(["good", "fair", "moderate", "poor", "very-poor", "extremely-poor"]);
export type AirLevel = z.infer<typeof AirLevelSchema>;

/** Output of `air_quality`. */
export const AirQualitySchema = z.object({
  kind: z.literal("air-quality"),
  location: LocationSchema,
  time: LocalTime,
  isDay: z.boolean(),
  /** European Air Quality Index: 0 is clean, above 100 is extremely poor. */
  index: z.number(),
  level: AirLevelSchema,
  uvIndex: z.number(),
  // Concentrations in μg/m³, each rated on the same six bands.
  pollutants: z.array(z.object({ name: z.string(), value: z.number(), level: AirLevelSchema })),
  hourly: z.array(z.object({ time: LocalTime, index: z.number(), level: AirLevelSchema })),
  // Pollen in grains/m³. Empty where there is no pollen forecast (outside Europe).
  pollen: z.array(z.object({ name: z.string(), grains: z.number() })),
});
export type AirQuality = z.infer<typeof AirQualitySchema>;

/** Output of `sun_times`. */
export const SunTimesSchema = z.object({
  kind: z.literal("sun-times"),
  location: LocationSchema,
  now: LocalTime,
  // Today first.
  days: z.array(
    z.object({
      date: z.string(),
      sunrise: LocalTime,
      sunset: LocalTime,
      daylightSeconds: z.number(),
      /** How much longer (or, when negative, shorter) this day is than the one before. */
      changeSeconds: z.number(),
      sunshineSeconds: z.number(),
      uvIndexMax: z.number(),
    }),
  ),
});
export type SunTimes = z.infer<typeof SunTimesSchema>;

/** Everything the widget can be asked to draw. */
export const ToolOutputSchema = z.discriminatedUnion("kind", [
  ForecastSchema,
  DryWindowsSchema,
  ComparisonSchema,
  AirQualitySchema,
  SunTimesSchema,
]);
export type ToolOutput = z.infer<typeof ToolOutputSchema>;

export const unitLabels = {
  metric: { temperature: "°C", wind: "km/h", precipitation: "mm" },
  imperial: { temperature: "°F", wind: "mph", precipitation: "in" },
} as const satisfies Record<Units, Record<string, string>>;

// WMO weather interpretation codes, as used by Open-Meteo.
const wmo: Record<number, readonly [Condition, string]> = {
  0: ["clear", "Clear sky"],
  1: ["clear", "Mainly clear"],
  2: ["partly-cloudy", "Partly cloudy"],
  3: ["cloudy", "Overcast"],
  45: ["fog", "Fog"],
  48: ["fog", "Freezing fog"],
  51: ["drizzle", "Light drizzle"],
  53: ["drizzle", "Drizzle"],
  55: ["drizzle", "Heavy drizzle"],
  56: ["drizzle", "Freezing drizzle"],
  57: ["drizzle", "Heavy freezing drizzle"],
  61: ["rain", "Light rain"],
  63: ["rain", "Rain"],
  65: ["rain", "Heavy rain"],
  66: ["rain", "Freezing rain"],
  67: ["rain", "Heavy freezing rain"],
  71: ["snow", "Light snow"],
  73: ["snow", "Snow"],
  75: ["snow", "Heavy snow"],
  77: ["snow", "Snow grains"],
  80: ["rain", "Light showers"],
  81: ["rain", "Showers"],
  82: ["rain", "Violent showers"],
  85: ["snow", "Snow showers"],
  86: ["snow", "Heavy snow showers"],
  95: ["thunder", "Thunderstorm"],
  96: ["thunder", "Thunderstorm with hail"],
  99: ["thunder", "Thunderstorm with heavy hail"],
};

/** Maps a WMO weather code to our condition bucket and a human description. */
export function describeWeatherCode(code: number): { condition: Condition; description: string } {
  const [condition, description] = wmo[code] ?? ["cloudy", "Unknown"];
  return { condition, description };
}
