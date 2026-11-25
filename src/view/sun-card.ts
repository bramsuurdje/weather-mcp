import { addHours, type SunTimes } from "../forecast";
import { backdrop } from "./backdrop";
import { duration, esc, HOUR_MINUTE, makeClock, regionOf, wallClock, type Clock } from "./format";
import { weatherIcon } from "./icons";

// The card for `sun_times`: the sun (or moon) riding an arc across the sky right now,
// then a week of daylight drawn on 24-hour tracks.

type Day = SunTimes["days"][number];

const ms = (iso: string) => wallClock(iso).getTime();
const DAY_MS = 86_400_000;

/** Golden hour is roughly the first hour after sunrise and the last hour before sunset. */
const goldenHours = (day: Day) => ({
  morning: [day.sunrise, addHours(day.sunrise, 1)] as const,
  evening: [addHours(day.sunset, -1), day.sunset] as const,
});

function quip(today: Day, isDay: boolean): string {
  if (!isDay) return "The sun has clocked out.";
  const hours = today.daylightSeconds / 3600;
  if (hours < 9) return "Blink and it's dark.";
  if (hours > 15) return "Daylight for days!";
  return "A fair share of sun.";
}

/** "3 min shorter than yesterday" */
function change(seconds: number): string {
  const minutes = Math.round(Math.abs(seconds) / 60);
  if (minutes === 0) return "Same length as yesterday";
  return `${minutes} min ${seconds > 0 ? "longer" : "shorter"} than yesterday`;
}

/**
 * The arc drawing (200×124). By day the sun travels it from sunrise to sunset; by night
 * the moon travels it from sunset to the next sunrise.
 */
function arc(s: SunTimes, today: Day, tomorrow: Day | undefined, isDay: boolean, clock: Clock): string {
  const now = ms(s.now);
  const beforeSunrise = now < ms(today.sunrise);
  // The stretch of time the arc stands for.
  const [from, to] = isDay
    ? [ms(today.sunrise), ms(today.sunset)]
    : beforeSunrise
      ? [ms(today.sunset) - DAY_MS, ms(today.sunrise)]
      : [ms(today.sunset), tomorrow ? ms(tomorrow.sunrise) : ms(today.sunrise) + DAY_MS];
  const progress = Math.min(Math.max((now - from) / (to - from), 0), 1);
  const x = 100 - 76 * Math.cos(Math.PI * progress);
  const y = 100 - 72 * Math.sin(Math.PI * progress);
  const [left, right] = isDay
    ? [today.sunrise, today.sunset]
    : [today.sunset, beforeSunrise ? today.sunrise : (tomorrow?.sunrise ?? today.sunrise)];
  return `
    <svg class="scene arc" viewBox="0 0 200 124" role="img" aria-label="${isDay ? "Sun" : "Moon"} position right now">
      <g class="boil" fill="none" stroke-linecap="round">
        <path d="M24 100A76 72 0 0 1 176 100" stroke="#fff" stroke-width="3" stroke-dasharray="1 9" opacity=".85"/>
        <path d="M6 100H194" stroke="#1b1b22" stroke-width="6"/>
        <path d="M6 100H194" stroke="#fff" stroke-width="3"/>
        <svg x="${(x - 25).toFixed(1)}" y="${(y - 25).toFixed(1)}" width="50" height="50" viewBox="0 0 64 64" overflow="visible">${weatherIcon("clear", isDay)}</svg>
      </g>
      <text x="24" y="118" text-anchor="middle">${clock.at(left, HOUR_MINUTE)}</text>
      <text x="176" y="118" text-anchor="middle">${clock.at(right, HOUR_MINUTE)}</text>
    </svg>`;
}

function hero(s: SunTimes, today: Day, clock: Clock): string {
  const now = ms(s.now);
  const isDay = now >= ms(today.sunrise) && now < ms(today.sunset);
  const golden = goldenHours(today);
  return `
    <section class="hero" data-sky="clear-${isDay ? "day" : "night"}">
      ${backdrop("clear", isDay, false)}
      <header class="place">
        <h1>${esc(s.location.name)}</h1>
        <p>${regionOf(s.location)} · Sun times · ${clock.at(s.now, { weekday: "long", ...HOUR_MINUTE })}</p>
      </header>
      <div class="now">
        <div class="reading">
          <p class="kicker">Daylight today</p>
          <div class="when num">${duration(today.daylightSeconds)}</div>
          <p class="desc">${clock.range(today.sunrise, today.sunset, HOUR_MINUTE)}</p>
          <p class="range num">${change(today.changeSeconds)}</p>
          <p class="quip">${quip(today, isDay)}</p>
        </div>
        ${arc(s, today, s.days[1], isDay, clock)}
      </div>
      <ul class="stats num">
        <li><span>Golden hour AM</span><strong>${clock.range(...golden.morning, HOUR_MINUTE)}</strong></li>
        <li><span>Golden hour PM</span><strong>${clock.range(...golden.evening, HOUR_MINUTE)}</strong></li>
        <li><span>Sunshine</span><strong>${duration(today.sunshineSeconds)}</strong></li>
        <li><span>UV max</span><strong>${today.uvIndexMax}</strong></li>
      </ul>
    </section>`;
}

/** A week of days, each a 24-hour track with the daylight (and golden hours) filled in. */
function week(s: SunTimes, clock: Clock): string {
  // Position on the 24-hour track, in percent.
  const at = (iso: string) => ((ms(iso) - ms(iso.slice(0, 10))) / DAY_MS) * 100;
  const rows = s.days
    .map((day, i) => {
      const golden = goldenHours(day);
      const span = (from: string, to: string, className: string) =>
        `<i class="${className}" style="left:${at(from).toFixed(2)}%;width:${(at(to) - at(from)).toFixed(2)}%"></i>`;
      const minutes = Math.round(day.changeSeconds / 60);
      return `
        <li class="enter" style="animation-delay:${i * 45}ms">
          <span class="day">${i === 0 ? "Today" : clock.at(day.date, { weekday: "short" })}</span>
          <span class="track" title="${clock.range(day.sunrise, day.sunset, HOUR_MINUTE)}">
            ${span(day.sunrise, day.sunset, "light")}${span(...golden.morning, "golden")}${span(...golden.evening, "golden")}
            ${i === 0 ? `<i class="marker" style="left:${at(s.now).toFixed(2)}%"></i>` : ""}
          </span>
          <span class="times num">${clock.range(day.sunrise, day.sunset, HOUR_MINUTE)}</span>
          <span class="length num">${duration(day.daylightSeconds)}</span>
          <span class="delta num ${minutes < 0 ? "down" : "up"}">${minutes > 0 ? "+" : minutes < 0 ? "−" : ""}${Math.abs(minutes)}m</span>
        </li>`;
    })
    .join("");
  return `<section class="panel"><h2>Daylight this week</h2><ol class="sun-days">${rows}</ol><p class="legend"><i class="light"></i>daylight <i class="golden"></i>golden hour (approx.)</p></section>`;
}

export function renderSunTimes(s: SunTimes, locale?: string): string {
  const clock = makeClock(locale);
  const [today] = s.days;
  if (!today) return "";
  return `
    <article class="card enter">
      ${hero(s, today, clock)}
      ${week(s, clock)}
      <p class="footer">Sun data by Open-Meteo.com</p>
    </article>`;
}
