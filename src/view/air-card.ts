import { AirLevelSchema, type AirLevel, type AirQuality, type Condition } from "../forecast";
import { backdrop } from "./backdrop";
import { esc, HOUR_MINUTE, makeClock, regionOf, type Clock } from "./format";
import { scene, type Mood } from "./icons";

// The card for `air_quality`: the index up top, then each pollutant on a six-step meter,
// the next 24 hours, and pollen where there is a forecast for it.

// How each band of the European Air Quality Index looks and feels. `sky` picks the
// backdrop: clean air gets an open sky, bad air gets smog.
const levels: Record<AirLevel, { label: string; color: string; quip: string; mood: Mood; sky: Condition }> = {
  good: { label: "Good", color: "#22c55e", quip: "Breathe it in. Fresh!", mood: "chill", sky: "clear" },
  fair: { label: "Fair", color: "#84cc16", quip: "Pretty breathable.", mood: "comfy", sky: "partly-cloudy" },
  moderate: { label: "Moderate", color: "#eab308", quip: "Bit stuffy out there.", mood: "comfy", sky: "cloudy" },
  poor: { label: "Poor", color: "#f97316", quip: "Maybe skip the jog.", mood: "sick", sky: "fog" },
  "very-poor": { label: "Very poor", color: "#ef4444", quip: "Windows shut. Seriously.", mood: "sick", sky: "fog" },
  "extremely-poor": { label: "Extremely poor", color: "#c026d3", quip: "Stay inside!", mood: "sick", sky: "fog" },
};

const uvLabel = (uv: number) =>
  uv < 3 ? "low" : uv < 6 ? "moderate" : uv < 8 ? "high" : uv < 11 ? "very high" : "extreme";

function hero(a: AirQuality, clock: Clock): string {
  const level = levels[a.level];
  return `
    <section class="hero" data-sky="${level.sky}-${a.isDay ? "day" : "night"}" data-mood="${level.mood}">
      ${backdrop(level.sky, a.isDay, false)}
      <header class="place">
        <h1>${esc(a.location.name)}</h1>
        <p>${regionOf(a.location)} · Air quality at ${clock.at(a.time, HOUR_MINUTE)}</p>
      </header>
      <div class="now">
        <div class="reading">
          <div class="temp num">${Math.round(a.index)}</div>
          <p class="desc"><i class="dot" style="background:${level.color}"></i>${level.label} air</p>
          <p class="range num">European AQI · UV index ${a.uvIndex} (${uvLabel(a.uvIndex)})</p>
          <p class="quip">${level.quip}</p>
        </div>
        <svg class="scene" viewBox="0 0 144 122" role="img" aria-label="${level.label} air">${scene(level.sky, a.isDay, level.mood)}</svg>
      </div>
    </section>`;
}

/** A six-step meter, lit up to the given band in that band's colour. */
function meter(level: AirLevel): string {
  const reached = AirLevelSchema.options.indexOf(level);
  return `<span class="meter">${AirLevelSchema.options
    .map((_, i) => `<i${i <= reached ? ` style="background:${levels[level].color}"` : ""}></i>`)
    .join("")}</span>`;
}

function pollutants(a: AirQuality): string {
  const rows = a.pollutants
    .map(
      (p) =>
        `<li><strong>${esc(p.name)}</strong>${meter(p.level)}<span class="num">${p.value} <small>μg/m³</small></span><small>${levels[p.level].label}</small></li>`,
    )
    .join("");
  return `<section class="panel"><h2>What's in the air</h2><ul class="pollutants">${rows}</ul></section>`;
}

function outlook(a: AirQuality, clock: Clock): string {
  const top = Math.max(100, ...a.hourly.map((h) => h.index));
  const bars = a.hourly
    .map(
      (h, i) =>
        `<i style="--h:${(h.index / top) * 100};--c:${levels[h.level].color}" title="${clock.at(h.time, HOUR_MINUTE)} · ${Math.round(h.index)}"><b></b><span>${i % 3 === 0 ? (i === 0 ? "Now" : clock.at(h.time, { hour: "numeric" })) : ""}</span></i>`,
    )
    .join("");
  return `<section class="panel"><h2>Next 24 hours</h2><div class="air-bars">${bars}</div></section>`;
}

function pollen(a: AirQuality): string {
  if (a.pollen.length === 0) return "";
  const active = a.pollen.filter((p) => p.grains > 0);
  const chips = active.length
    ? active.map((p) => `<li><strong>${esc(p.name)}</strong> ${p.grains} <small>grains/m³</small></li>`).join("")
    : `<li>No pollen in the air right now</li>`;
  return `<section class="panel"><h2>Pollen</h2><ul class="chips">${chips}</ul></section>`;
}

export function renderAirQuality(a: AirQuality, locale?: string): string {
  const clock = makeClock(locale);
  return `
    <article class="card enter">
      ${hero(a, clock)}
      ${pollutants(a)}
      ${outlook(a, clock)}
      ${pollen(a)}
      <p class="footer">Air quality data by Open-Meteo.com (CAMS)</p>
    </article>`;
}
