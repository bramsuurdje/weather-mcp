import { WeatherInputError } from "./errors";
import { addHours, type DryWindow, type DryWindows, type OutlookHour, type Units } from "./forecast";
import type { Outlook } from "./open-meteo";

// Finds the best time slots for doing something outside. "Best" means: lowest rain
// chance first, then least rain, then the most comfortable temperature, then soonest.

export type WindowRequest = {
  /** How many hours in a row are needed. */
  hoursNeeded: number;
  /** A window may not start before this hour of the day (0-23). */
  earliestHour: number;
  /** A window must be over by this hour of the day (1-24). */
  latestHour: number;
  units: Units;
};

const MAX_WINDOWS = 3;

// Tie-breaker: how far a window is from the feels-like temperature people find most pleasant
// outside, counted in coarse steps so a degree of difference does not beat an earlier slot.
const COMFORT = {
  metric: { ideal: 20, step: 3 },
  imperial: { ideal: 68, step: 5 },
} as const satisfies Record<Units, { ideal: number; step: number }>;

const hourOf = (time: string) => Number(time.slice(11, 13));

const round = (value: number, decimals: number) => Number(value.toFixed(decimals));

/** The best non-overlapping windows that still lie ahead of `now`, best first. */
export function findDryWindows(hours: OutlookHour[], now: string, request: WindowRequest): DryWindow[] {
  const { hoursNeeded, earliestHour, latestHour, units } = request;
  const byTime = new Map(hours.map((hour) => [hour.time, hour]));

  const candidates = hours.flatMap((first): DryWindow[] => {
    const startHour = hourOf(first.time);
    if (first.time < now || startHour < earliestHour || startHour + hoursNeeded > latestHour) return [];
    const span = Array.from({ length: hoursNeeded }, (_, i) => byTime.get(addHours(first.time, i))).filter(
      (hour) => hour !== undefined,
    );
    if (span.length < hoursNeeded) return [];
    const wettest = span.reduce((a, b) => (b.precipitationChance > a.precipitationChance ? b : a));
    return [
      {
        start: first.time,
        end: addHours(first.time, hoursNeeded),
        precipitationChance: wettest.precipitationChance,
        precipitation: round(span.reduce((sum, hour) => sum + hour.precipitation, 0), 2),
        feelsLike: round(span.reduce((sum, hour) => sum + hour.feelsLike, 0) / span.length, 1),
        condition: wettest.condition,
        isDay: first.isDay,
      },
    ];
  });

  const { ideal, step } = COMFORT[units];
  const discomfort = (window: DryWindow) => Math.floor(Math.abs(window.feelsLike - ideal) / step);
  candidates.sort(
    (a, b) =>
      a.precipitationChance - b.precipitationChance ||
      a.precipitation - b.precipitation ||
      discomfort(a) - discomfort(b) ||
      a.start.localeCompare(b.start),
  );

  const picked: DryWindow[] = [];
  for (const candidate of candidates) {
    if (picked.length === MAX_WINDOWS) break;
    if (picked.every((other) => candidate.end <= other.start || candidate.start >= other.end)) picked.push(candidate);
  }
  return picked;
}

/** Builds the `find_dry_window` result from an hourly outlook. */
export function planDryWindows(outlook: Outlook, request: WindowRequest): DryWindows {
  const { hoursNeeded, earliestHour, latestHour } = request;
  if (latestHour - earliestHour < hoursNeeded) {
    throw new WeatherInputError(
      `${hoursNeeded} hours do not fit between ${earliestHour}:00 and ${latestHour}:00. Widen earliestHour/latestHour or lower hours.`,
    );
  }

  const [best, ...alternatives] = findDryWindows(outlook.hours, outlook.now, request);
  if (!best) {
    throw new WeatherInputError(
      `No ${hoursNeeded}-hour window is left between ${earliestHour}:00 and ${latestHour}:00 in those days. Search later dates or widen the hours.`,
    );
  }

  const days = new Map<string, OutlookHour[]>();
  for (const hour of outlook.hours) {
    if (hourOf(hour.time) < earliestHour || hourOf(hour.time) >= latestHour) continue;
    const date = hour.time.slice(0, 10);
    days.set(date, [...(days.get(date) ?? []), hour]);
  }

  return {
    kind: "dry-windows",
    location: outlook.location,
    units: request.units,
    now: outlook.now,
    hoursNeeded,
    earliestHour,
    latestHour,
    days: [...days].map(([date, hours]) => ({ date, hours })),
    windows: [best, ...alternatives],
  };
}
