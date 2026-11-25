import { unitLabels, type Comparison, type Condition, type Forecast } from "../forecast";
import { backdrop } from "./backdrop";
import { deg, esc, HOUR_MINUTE, icon, makeClock, regionOf, toCelsius, type Clock } from "./format";
import { moodFor, scene, weatherIcon, type TemperatureMood } from "./icons";

// Turns forecasts into card HTML. Pure string building, no host or DOM access,
// so it can be rendered anywhere (the widget, a preview page).

const compass = (degrees: number) =>
  ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(degrees / 45) % 8];

// Cold → warm colour ramp, keyed on °C.
const ramp: Array<[number, [number, number, number]]> = [
  [-15, [124, 58, 237]],
  [-5, [59, 130, 246]],
  [5, [6, 182, 212]],
  [12, [34, 197, 94]],
  [18, [234, 179, 8]],
  [25, [249, 115, 22]],
  [32, [239, 68, 68]],
];

function tempColor(celsius: number): string {
  const [first] = ramp;
  const last = ramp[ramp.length - 1];
  if (!first || !last) return "currentColor";
  if (celsius <= first[0]) return `rgb(${first[1].join()})`;
  if (celsius >= last[0]) return `rgb(${last[1].join()})`;
  const upper = ramp.findIndex(([t]) => t >= celsius);
  const [t0, c0] = ramp[upper - 1] ?? first;
  const [t1, c1] = ramp[upper] ?? last;
  const k = (celsius - t0) / (t1 - t0);
  return `rgb(${c0.map((v, i) => Math.round(v + ((c1[i] ?? v) - v) * k)).join()})`;
}

// ---------- Hero ----------

// The buddy's one-liner. Bad weather wins over temperature.
const weatherQuips: Partial<Record<Condition, string>> = {
  thunder: "The sky is yelling. Stay in.",
  rain: "Free shower, no refunds.",
  drizzle: "Tiny annoying drops.",
  snow: "Snowball fight o'clock!",
  fog: "Who turned off the view?",
};

/** Wind speed from which gusts show up in the sky. */
const GUSTY_KMH = 30;

const moodQuips: Record<TemperatureMood, string> = {
  melting: "It's melting o'clock.",
  chill: "Sunglasses weather!",
  comfy: "Pretty decent, honestly.",
  cold: "Jacket. Now.",
  frozen: "Brr! Wear everything you own.",
};

function hero(f: Forecast, clock: Clock): string {
  const u = unitLabels[f.units];
  const c = f.current;
  const today = f.daily[0];
  const mood = moodFor(toCelsius(c.feelsLike, f.units));
  const sky = `${c.condition}-${c.isDay ? "day" : "night"}`;
  const windKmh = f.units === "imperial" ? c.windSpeed * 1.609 : c.windSpeed;
    const arrow = `<svg viewBox="0 0 24 24" style="transform:rotate(${c.windDirection + 180}deg)"><path d="M12 3l6 16-6-4-6 4z" fill="currentColor"/></svg>`;
  return `
    <section class="hero" data-sky="${sky}" data-mood="${mood}">
      ${backdrop(c.condition, c.isDay, windKmh >= GUSTY_KMH)}
      <header class="place">
        <h1>${esc(f.location.name)}</h1>
        <p>${regionOf(f.location)} · ${clock.at(c.time, { weekday: "long", ...HOUR_MINUTE })}</p>
      </header>
      <div class="now">
        <div class="reading">
          <div class="temp num">${deg(c.temperature)}</div>
          <p class="desc">${esc(c.description)}</p>
          ${today ? `<p class="range num">H ${deg(today.max)} · L ${deg(today.min)}</p>` : ""}
          <p class="quip">${esc(weatherQuips[c.condition] ?? moodQuips[mood])}</p>
        </div>
        <svg class="scene" viewBox="0 0 144 122" role="img" aria-label="${esc(c.description)}, feeling ${mood}">${scene(c.condition, c.isDay, mood)}</svg>
      </div>
      <ul class="stats num">
        <li><span>Feels like</span><strong>${deg(c.feelsLike)}</strong></li>
        <li><span>Wind</span><strong>${arrow}${Math.round(c.windSpeed)} <small>${u.wind} ${compass(c.windDirection)}</small></strong></li>
        <li><span>Humidity</span><strong>${Math.round(c.humidity)}%</strong></li>
        <li><span>Precip.</span><strong>${c.precipitation} <small>${u.precipitation}</small></strong></li>
      </ul>
    </section>`;
}

// ---------- Next 24 hours ----------

/** Smooth path through points (Catmull-Rom converted to cubic Béziers). */
function smooth(points: Array<[number, number]>): string {
  return points
    .map(([x, y], i) => {
      if (i === 0) return `M${x} ${y}`;
      const [x0, y0] = points[i - 2] ?? points[i - 1]!;
      const [x1, y1] = points[i - 1]!;
      const [x3, y3] = points[i + 1] ?? [x, y];
      return `C${x1 + (x - x0) / 6} ${y1 + (y - y0) / 6} ${x - (x3 - x1) / 6} ${y - (y3 - y1) / 6} ${x} ${y}`;
    })
    .join("");
}

function hourly(f: Forecast, clock: Clock): string {
  const hours = f.hourly;
  const cw = 50;
  const width = hours.length * cw;
  const top = 76;
  const bottom = 118;
  const temps = hours.map((h) => h.temperature);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const y = (t: number) => bottom - ((t - min) / (max - min || 1)) * (bottom - top);
  const points = hours.map((h, i): [number, number] => [i * cw + cw / 2, y(h.temperature)]);
  const line = smooth(points);
  const stops = hours
    .map((h, i) => `<stop offset="${(i / Math.max(hours.length - 1, 1)) * 100}%" stop-color="${tempColor(toCelsius(h.temperature, f.units))}"/>`)
    .join("");

  const columns = hours
    .map((h, i) => {
      const [x, py] = points[i]!;
      const label = i === 0 ? "Now" : clock.at(h.time, { hour: "numeric" });
      const barH = (h.precipitationChance / 100) * 22;
      return `
        <text class="h-label" x="${x}" y="13" text-anchor="middle">${label}</text>
        <svg x="${x - 17}" y="18" width="34" height="34" viewBox="0 0 64 64">${weatherIcon(h.condition, h.isDay)}</svg>
        <text class="t-label num" x="${x}" y="${py - 9}" text-anchor="middle">${deg(h.temperature)}</text>
        <rect class="p-bar" x="${x - 8}" y="${152 - barH}" width="16" height="${barH}" rx="3"/>
        ${h.precipitationChance >= 10 ? `<text class="p-label num" x="${x}" y="${148 - barH}" text-anchor="middle">${h.precipitationChance}%</text>` : ""}`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>Next 24 hours</h2>
      <div class="hourly">
        <svg width="${width}" height="156" viewBox="0 0 ${width} 156" role="img" aria-label="Temperature for the next 24 hours">
          <defs>
            <linearGradient id="temp-line" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient>
            <linearGradient id="temp-fade" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#fff" stop-opacity=".9"/><stop offset="100%" stop-color="#fff" stop-opacity="0"/>
            </linearGradient>
            <mask id="temp-mask"><rect width="${width}" height="156" fill="url(#temp-fade)"/></mask>
          </defs>
          <path class="grid" d="M0 ${bottom + 10}H${width}"/>
          <path d="${line}L${width - cw / 2} ${bottom + 10}L${cw / 2} ${bottom + 10}Z" fill="url(#temp-line)" opacity=".22" mask="url(#temp-mask)"/>
          <path d="${line}" fill="none" stroke="url(#temp-line)" stroke-width="3" stroke-linecap="round"/>
          ${points.map(([x, py]) => `<circle cx="${x}" cy="${py}" r="2.5" fill="var(--panel)" stroke="url(#temp-line)" stroke-width="2"/>`).join("")}
          ${columns}
        </svg>
      </div>
    </section>`;
}

// ---------- 7 days ----------

function daily(f: Forecast, clock: Clock): string {
  const weekMin = Math.min(...f.daily.map((d) => d.min));
  const weekMax = Math.max(...f.daily.map((d) => d.max));
  const span = weekMax - weekMin || 1;
  const pct = (t: number) => ((t - weekMin) / span) * 100;

  const rows = f.daily
    .map((d, i) => {
      const now =
        i === 0
          ? `<i style="left:calc(${pct(Math.min(Math.max(f.current.temperature, d.min), d.max))}% - 5px);width:10px;height:10px;top:-2px;border-radius:50%;background:#fff;box-shadow:0 0 0 2px var(--panel),0 1px 3px rgba(0,0,0,.3)"></i>`
          : "";
      return `
        <li class="enter" style="animation-delay:${i * 45}ms">
          <span class="day">${i === 0 ? "Today" : clock.at(d.date, { weekday: "short" })}</span>
          <span class="icon" title="${esc(d.description)}">${icon(d.condition, true)}</span>
          <span class="pop num">${d.precipitationChance >= 10 ? `${d.precipitationChance}%` : ""}</span>
          <span class="lo num">${deg(d.min)}</span>
          <span class="bar"><i style="left:${pct(d.min)}%;width:${Math.max(pct(d.max) - pct(d.min), 2)}%;background:linear-gradient(90deg,${tempColor(toCelsius(d.min, f.units))},${tempColor(toCelsius(d.max, f.units))})"></i>${now}</span>
          <span class="hi num">${deg(d.max)}</span>
        </li>`;
    })
    .join("");

  return `<section class="panel"><h2>7-day forecast</h2><ol class="days">${rows}</ol></section>`;
}

// ---------- Entry points ----------

const footer = (f: Forecast) =>
  `<p class="footer">Weather data by Open-Meteo.com · ${unitLabels[f.units].temperature}</p>`;

/** The full weather card for one city. `locale` controls how times and weekdays are written. */
export function renderForecast(f: Forecast, locale?: string): string {
  const clock = makeClock(locale);
  return `
    <article class="card enter">
      ${hero(f, clock)}
      ${hourly(f, clock)}
      ${daily(f, clock)}
      ${footer(f)}
    </article>`;
}

/** The place that beats every other one on `score`, or nothing when the top is shared. */
function winner(places: Forecast[], score: (f: Forecast) => number): Forecast | undefined {
  const [first, second] = [...places].sort((a, b) => score(b) - score(a));
  return first && second && score(first) > score(second) ? first : undefined;
}

/** Several cities side by side: each gets its own sky and buddy, and the winners get a badge. */
export function renderComparison(c: Comparison, locale?: string): string {
  const clock = makeClock(locale);
  const badges = [
    { label: "Warmest", place: winner(c.places, (f) => f.current.feelsLike) },
    { label: "Driest", place: winner(c.places, (f) => -(f.daily[0]?.precipitationChance ?? 0)) },
    { label: "Calmest", place: winner(c.places, (f) => -f.current.windSpeed) },
  ];
  const contenders = c.places
    .map((f) => {
      const won = badges.filter((b) => b.place === f).map((b) => `<span class="badge">${b.label}</span>`);
      return `<div class="contender"><div class="badges">${won.join("")}</div>${hero(f, clock)}</div>`;
    })
    .join("");
  const [first] = c.places;
  return `<article class="card enter"><div class="versus">${contenders}</div>${first ? footer(first) : ""}</article>`;
}

/** A card holding only a message, for loading and error states. */
export const renderStatus = (message: string, loading = false) =>
  `<div class="card"><div class="status">${loading ? '<div class="spinner"></div>' : ""}${esc(message)}</div></div>`;
