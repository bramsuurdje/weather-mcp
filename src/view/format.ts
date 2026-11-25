import type { Condition, Location, Units } from "../forecast";
import { weatherIcon } from "./icons";

// Small helpers the cards share.

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const deg = (t: number) => `${Math.round(t)}°`;

export const toCelsius = (t: number, units: Units) => (units === "imperial" ? ((t - 32) * 5) / 9 : t);

/** "Friesland, The Netherlands", escaped. */
export const regionOf = (l: Location) => [l.region, l.country].filter((s) => s !== undefined).map(esc).join(", ");

export const icon = (condition: Condition, isDay: boolean) =>
  `<svg viewBox="0 0 64 64" aria-hidden="true">${weatherIcon(condition, isDay)}</svg>`;

/** "8h 10m" */
export function duration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * Parses a local wall-clock string ("2026-11-25T13:00" or "2026-11-25") as if it were UTC,
 * so it is never shifted into the viewer's timezone.
 */
export const wallClock = (iso: string) => new Date(`${iso.length === 10 ? `${iso}T00:00` : iso}Z`);

/** Writes the forecast's local wall-clock times in the viewer's locale. */
export function makeClock(locale?: string) {
  const formatter = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" });
  return {
    at: (iso: string, options: Intl.DateTimeFormatOptions) => formatter(options).format(wallClock(iso)),
    range: (from: string, to: string, options: Intl.DateTimeFormatOptions) =>
      formatter(options).formatRange(wallClock(from), wallClock(to)),
  };
}
export type Clock = ReturnType<typeof makeClock>;

/** Hours and minutes, as in "2:00 PM" or "14:00". */
export const HOUR_MINUTE = { hour: "numeric", minute: "2-digit" } as const satisfies Intl.DateTimeFormatOptions;
