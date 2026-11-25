import { z } from "zod";
import { WeatherInputError } from "./errors";
import {
  AirLevelSchema,
  describeWeatherCode,
  type AirLevel,
  type AirQuality,
  type Forecast,
  type Location,
  type OutlookHour,
  type SunTimes,
  type Units,
} from "./forecast";

// Open-Meteo: free, no API key. https://open-meteo.com/en/docs

const PlaceSchema = z.object({
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  country: z.string(),
  admin1: z.string().optional(),
});

const GeocodeResponse = z.object({ results: z.array(PlaceSchema).optional() });

const ForecastResponse = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    temperature_2m: z.number(),
    apparent_temperature: z.number(),
    relative_humidity_2m: z.number(),
    weather_code: z.number(),
    wind_speed_10m: z.number(),
    wind_direction_10m: z.number(),
    precipitation: z.number(),
    is_day: z.number(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    temperature_2m: z.array(z.number()),
    precipitation_probability: z.array(z.number().nullable()),
    weather_code: z.array(z.number()),
    is_day: z.array(z.number()),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
    precipitation_probability_max: z.array(z.number().nullable()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
  }),
});

const OutlookResponse = z.object({
  timezone: z.string(),
  current: z.object({ time: z.string() }),
  hourly: z.object({
    time: z.array(z.string()),
    apparent_temperature: z.array(z.number()),
    precipitation_probability: z.array(z.number().nullable()),
    precipitation: z.array(z.number()),
    weather_code: z.array(z.number()),
    is_day: z.array(z.number()),
  }),
});

// Open-Meteo answers a bad request (for example dates it has no forecast for) with a reason.
const BadRequest = z.object({ reason: z.string() });

async function getJson<T extends z.ZodType>(url: URL, schema: T): Promise<z.infer<T>> {
  const res = await fetch(url);
  if (res.status === 400) {
    const body = BadRequest.safeParse(await res.json());
    throw new WeatherInputError(body.success ? body.data.reason : "The weather service rejected the request.");
  }
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status} for ${url.pathname}`);
  return schema.parse(await res.json());
}

type Place = { city: string; countryCode?: string };

/** Looks up a city, optionally narrowed by ISO country code. */
async function findPlace({ city, countryCode }: Place) {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({
    name: city,
    count: "1",
    format: "json",
    ...(countryCode && { countryCode: countryCode.toUpperCase() }),
  }).toString();
  const place = (await getJson(url, GeocodeResponse)).results?.[0];
  if (!place) {
    throw new WeatherInputError(
      `No place found named "${city}". Try the plain city name in English, optionally with a countryCode.`,
    );
  }
  return place;
}

const toLocation = (place: z.infer<typeof PlaceSchema>, timezone: string): Location => ({
  name: place.name,
  region: place.admin1,
  country: place.country,
  latitude: place.latitude,
  longitude: place.longitude,
  timezone,
});

/** The forecast endpoint for a place, in the requested units and the place's own timezone. */
function forecastUrl(place: z.infer<typeof PlaceSchema>, units: Units, params: Record<string, string>): URL {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: "auto",
    ...(units === "imperial" && {
      temperature_unit: "fahrenheit",
      wind_speed_unit: "mph",
      precipitation_unit: "inch",
    }),
    ...params,
  }).toString();
  return url;
}

/** Current weather, the next 24 hours and 7 days for a city. */
export async function getForecast(input: Place & { units: Units }): Promise<Forecast> {
  const place = await findPlace(input);
  const url = forecastUrl(place, input.units, {
    forecast_days: "7",
    forecast_hours: "24",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,precipitation,is_day",
    hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
  });
  const data = await getJson(url, ForecastResponse);
  const { current, hourly, daily } = data;

  return {
    kind: "forecast",
    location: toLocation(place, data.timezone),
    units: input.units,
    current: {
      time: current.time,
      temperature: current.temperature_2m,
      feelsLike: current.apparent_temperature,
      humidity: current.relative_humidity_2m,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      precipitation: current.precipitation,
      isDay: current.is_day === 1,
      ...describeWeatherCode(current.weather_code),
    },
    hourly: hourly.time.map((time, i) => ({
      time,
      temperature: hourly.temperature_2m[i] ?? 0,
      precipitationChance: hourly.precipitation_probability[i] ?? 0,
      condition: describeWeatherCode(hourly.weather_code[i] ?? 0).condition,
      isDay: hourly.is_day[i] === 1,
    })),
    daily: daily.time.map((date, i) => ({
      date,
      min: daily.temperature_2m_min[i] ?? 0,
      max: daily.temperature_2m_max[i] ?? 0,
      precipitationChance: daily.precipitation_probability_max[i] ?? 0,
      sunrise: daily.sunrise[i] ?? "",
      sunset: daily.sunset[i] ?? "",
      ...describeWeatherCode(daily.weather_code[i] ?? 0),
    })),
  };
}

export type Outlook = { location: Location; now: string; hours: OutlookHour[] };

/**
 * Every hour of the given days for a city. Without a `startDate` it covers today and the
 * next two days; with one it covers `startDate` through `endDate` (or just that one day).
 */
export async function getOutlook(
  input: Place & { units: Units; startDate?: string; endDate?: string },
): Promise<Outlook> {
  const place = await findPlace(input);
  const url = forecastUrl(place, input.units, {
    current: "is_day",
    hourly: "apparent_temperature,precipitation_probability,precipitation,weather_code,is_day",
    ...(input.startDate
      ? { start_date: input.startDate, end_date: input.endDate ?? input.startDate }
      : { forecast_days: "3" }),
  });
  const data = await getJson(url, OutlookResponse);
  const { hourly } = data;

  return {
    location: toLocation(place, data.timezone),
    now: data.current.time,
    hours: hourly.time.map((time, i) => ({
      time,
      feelsLike: hourly.apparent_temperature[i] ?? 0,
      precipitationChance: hourly.precipitation_probability[i] ?? 0,
      precipitation: hourly.precipitation[i] ?? 0,
      condition: describeWeatherCode(hourly.weather_code[i] ?? 0).condition,
      isDay: hourly.is_day[i] === 1,
    })),
  };
}

const AirQualityResponse = z.object({
  timezone: z.string(),
  current: z.object({
    time: z.string(),
    is_day: z.number(),
    european_aqi: z.number(),
    uv_index: z.number().nullable(),
    pm2_5: z.number(),
    pm10: z.number(),
    nitrogen_dioxide: z.number(),
    ozone: z.number(),
    alder_pollen: z.number().nullable(),
    birch_pollen: z.number().nullable(),
    grass_pollen: z.number().nullable(),
    mugwort_pollen: z.number().nullable(),
    olive_pollen: z.number().nullable(),
    ragweed_pollen: z.number().nullable(),
  }),
  hourly: z.object({ time: z.array(z.string()), european_aqi: z.array(z.number().nullable()) }),
});

// Upper bounds of the first five European AQI bands; anything above the last is "extremely poor".
// The index itself uses the same 20-point steps for every pollutant.
const airBands = {
  index: [20, 40, 60, 80, 100],
  "PM2.5": [10, 20, 25, 50, 75],
  PM10: [20, 40, 50, 100, 150],
  "NO₂": [40, 90, 120, 230, 340],
  "O₃": [50, 100, 130, 240, 380],
} as const;

const rateAir = (value: number, bands: readonly number[]): AirLevel =>
  AirLevelSchema.options[bands.findIndex((limit) => value <= limit)] ?? "extremely-poor";

/** Air quality right now and for the next 24 hours, plus UV index and pollen where available. */
export async function getAirQuality(input: Place): Promise<AirQuality> {
  const place = await findPlace(input);
  const url = new URL("https://air-quality-api.open-meteo.com/v1/air-quality");
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    timezone: "auto",
    forecast_hours: "24",
    current:
      "is_day,european_aqi,uv_index,pm2_5,pm10,nitrogen_dioxide,ozone,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen",
    hourly: "european_aqi",
  }).toString();
  const { timezone, current, hourly } = await getJson(url, AirQualityResponse);

  const pollen = {
    Alder: current.alder_pollen,
    Birch: current.birch_pollen,
    Grass: current.grass_pollen,
    Mugwort: current.mugwort_pollen,
    Olive: current.olive_pollen,
    Ragweed: current.ragweed_pollen,
  };
  const pollutant = (name: Exclude<keyof typeof airBands, "index">, value: number) => ({
    name,
    value,
    level: rateAir(value, airBands[name]),
  });

  return {
    kind: "air-quality",
    location: toLocation(place, timezone),
    time: current.time,
    isDay: current.is_day === 1,
    index: current.european_aqi,
    level: rateAir(current.european_aqi, airBands.index),
    uvIndex: current.uv_index ?? 0,
    pollutants: [
      pollutant("PM2.5", current.pm2_5),
      pollutant("PM10", current.pm10),
      pollutant("NO₂", current.nitrogen_dioxide),
      pollutant("O₃", current.ozone),
    ],
    hourly: hourly.time.flatMap((time, i) => {
      const index = hourly.european_aqi[i];
      return index == null ? [] : [{ time, index, level: rateAir(index, airBands.index) }];
    }),
    pollen: Object.entries(pollen).flatMap(([name, grains]) => (grains == null ? [] : [{ name, grains }])),
  };
}

const SunTimesResponse = z.object({
  timezone: z.string(),
  current: z.object({ time: z.string() }),
  daily: z.object({
    time: z.array(z.string()),
    sunrise: z.array(z.string()),
    sunset: z.array(z.string()),
    daylight_duration: z.array(z.number()),
    sunshine_duration: z.array(z.number().nullable()),
    uv_index_max: z.array(z.number().nullable()),
  }),
});

/** Sunrise, sunset and day length for today and the next six days. */
export async function getSunTimes(input: Place): Promise<SunTimes> {
  const place = await findPlace(input);
  // One day back, only to tell how much today's length changed.
  const url = forecastUrl(place, "metric", {
    past_days: "1",
    forecast_days: "7",
    current: "is_day",
    daily: "sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max",
  });
  const { timezone, current, daily } = await getJson(url, SunTimesResponse);

  return {
    kind: "sun-times",
    location: toLocation(place, timezone),
    now: current.time,
    days: daily.time.flatMap((date, i) => {
      const daylightSeconds = daily.daylight_duration[i] ?? 0;
      const dayBefore = daily.daylight_duration[i - 1];
      if (dayBefore === undefined) return [];
      return [
        {
          date,
          sunrise: daily.sunrise[i] ?? "",
          sunset: daily.sunset[i] ?? "",
          daylightSeconds,
          changeSeconds: daylightSeconds - dayBefore,
          sunshineSeconds: daily.sunshine_duration[i] ?? 0,
          uvIndexMax: daily.uv_index_max[i] ?? 0,
        },
      ];
    }),
  };
}
