import { expect, test } from "bun:test";
import { findDryWindows, type WindowRequest } from "./dry-window";
import type { OutlookHour } from "./forecast";

/** One day of hours starting at midnight, with the given rain chance per hour. */
const day = (date: string, chances: number[], feelsLike = 10): OutlookHour[] =>
  chances.map((precipitationChance, hour) => ({
    time: `${date}T${String(hour).padStart(2, "0")}:00`,
    feelsLike,
    precipitationChance,
    precipitation: precipitationChance / 100,
    condition: precipitationChance > 50 ? "rain" : "clear",
    isDay: true,
  }));

const request: WindowRequest = { hoursNeeded: 2, earliestHour: 7, latestHour: 22, units: "metric" };

// Wet all day, except a dry gap from 14:00 to 16:00.
const wetWithGap = day("2026-11-26", Array.from({ length: 24 }, (_, hour) => (hour === 14 || hour === 15 ? 5 : 80)));

test("picks the driest stretch of the day", () => {
  const [best] = findDryWindows(wetWithGap, "2026-11-26T00:00", request);
  expect(best).toMatchObject({ start: "2026-11-26T14:00", end: "2026-11-26T16:00", precipitationChance: 5 });
});

test("rates a window by its wettest hour", () => {
  const [best] = findDryWindows(wetWithGap, "2026-11-26T00:00", { ...request, hoursNeeded: 3 });
  expect(best?.precipitationChance).toBe(80);
});

test("only offers windows that are still ahead and inside the allowed hours", () => {
  const dry = day("2026-11-26", Array.from({ length: 24 }, () => 0));
  const windows = findDryWindows(dry, "2026-11-26T19:30", request);
  // After 19:30 only 20:00-22:00 fits before the 22:00 cut-off.
  expect(windows.map((w) => w.start)).toEqual(["2026-11-26T20:00"]);
});

test("returns alternatives that do not overlap", () => {
  const dry = day("2026-11-26", Array.from({ length: 24 }, () => 0));
  const windows = findDryWindows(dry, "2026-11-26T00:00", request);
  expect(windows).toHaveLength(3);
  for (const [i, a] of windows.entries()) {
    for (const b of windows.slice(i + 1)) expect(a.end <= b.start || a.start >= b.end).toBe(true);
  }
});

test("prefers the sooner window when the temperatures are close", () => {
  const today = day("2026-11-26", Array.from({ length: 24 }, () => 0), 9);
  const tomorrow = day("2026-11-27", Array.from({ length: 24 }, () => 0), 10);
  const [best] = findDryWindows([...today, ...tomorrow], "2026-11-26T00:00", request);
  expect(best?.start).toBe("2026-11-26T07:00");
});

test("breaks a tie on rain with the clearly more comfortable temperature", () => {
  const cold = day("2026-11-26", Array.from({ length: 24 }, () => 0), 2);
  const mild = day("2026-11-27", Array.from({ length: 24 }, () => 0), 16);
  const [best] = findDryWindows([...cold, ...mild], "2026-11-26T00:00", request);
  expect(best?.start.slice(0, 10)).toBe("2026-11-27");
});
