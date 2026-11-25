import { addHours, unitLabels, type DryWindow, type DryWindows } from "../forecast";
import { backdrop } from "./backdrop";
import { deg, esc, HOUR_MINUTE, icon, makeClock, regionOf, toCelsius, type Clock } from "./format";
import { moodFor, scene } from "./icons";

// The card for `find_dry_window`: the best slot up top, then every searched hour
// as a rain-chance bar with the winning slots boxed in.

function quip(chance: number): string {
  if (chance < 20) return "Go go go! Dry as toast.";
  if (chance < 50) return "Might sprinkle. Risk it?";
  return "No dry slot. Bring a boat.";
}

/** Colour band for a rain chance: dry, risky or wet. */
const band = (chance: number) => (chance < 20 ? "dry" : chance < 50 ? "risky" : "wet");

/** "Today", or the weekday and date of a window. */
const dayOf = (w: DryWindow, d: DryWindows, clock: Clock) =>
  w.start.slice(0, 10) === d.now.slice(0, 10)
    ? "Today"
    : clock.at(w.start, { weekday: "long", day: "numeric", month: "short" });

function hero(d: DryWindows, clock: Clock): string {
  const [best] = d.windows;
  const mood = moodFor(toCelsius(best.feelsLike, d.units));
  return `
    <section class="hero" data-sky="${best.condition}-${best.isDay ? "day" : "night"}" data-mood="${mood}">
      ${backdrop(best.condition, best.isDay, false)}
      <header class="place">
        <h1>${esc(d.location.name)}</h1>
        <p>${regionOf(d.location)} · Best ${d.hoursNeeded}-hour dry window</p>
      </header>
      <div class="now">
        <div class="reading">
          <p class="kicker">${dayOf(best, d, clock)}</p>
          <div class="when num">${clock.range(best.start, best.end, HOUR_MINUTE)}</div>
          <p class="desc">Rain chance up to ${best.precipitationChance}%</p>
          <p class="range num">Feels like ${deg(best.feelsLike)} · ${best.precipitation} ${unitLabels[d.units].precipitation} expected</p>
          <p class="quip">${quip(best.precipitationChance)}</p>
        </div>
        <svg class="scene" viewBox="0 0 144 122" role="img" aria-label="Feeling ${mood}">${scene(best.condition, best.isDay, mood)}</svg>
      </div>
    </section>`;
}

/** One row per searched day, one cell per hour. The winning windows are boxed and numbered. */
function strips(d: DryWindows, clock: Clock): string {
  const columns = Array.from({ length: d.latestHour - d.earliestHour }, (_, i) => d.earliestHour + i);
  const rankAt = (time: string) => d.windows.findIndex((w) => time >= w.start && time < w.end) + 1;

  const axis = columns
    .map((hour, i) => `<span>${i % 3 === 0 ? clock.at(`2000-01-01T${String(hour).padStart(2, "0")}:00`, { hour: "numeric" }) : ""}</span>`)
    .join("");

  const rows = d.days
    .map((day) => {
      const cells = day.hours
        .map((h) => {
          const rank = rankAt(h.time);
          const window = d.windows[rank - 1];
          const classes = [
            band(h.precipitationChance),
            h.time < d.now && "past",
            window && "win",
            window?.start === h.time && "start",
            // The window ends at the start of the hour after its last cell.
            window && rankAt(addHours(h.time, 1)) !== rank && "end",
          ].filter(Boolean);
          return `<i class="${classes.join(" ")}" style="--p:${h.precipitationChance}" title="${clock.at(h.time, HOUR_MINUTE)} · ${h.precipitationChance}%"><b></b>${window?.start === h.time ? `<em>${rank}</em>` : ""}</i>`;
        })
        .join("");
      const today = day.date === d.now.slice(0, 10);
      return `<span class="day">${today ? "Today" : clock.at(day.date, { weekday: "short" })}</span><div class="cells">${cells}</div>`;
    })
    .join("");

  return `
    <section class="panel">
      <h2>Rain chance, hour by hour</h2>
      <div class="strips" style="--cols:${columns.length}">
        <span></span><div class="cells axis">${axis}</div>
        ${rows}
      </div>
      <p class="legend"><i class="dry"></i>under 20% <i class="risky"></i>20–50% <i class="wet"></i>over 50%</p>
    </section>`;
}

function ranking(d: DryWindows, clock: Clock): string {
  const rows = d.windows
    .map(
      (w, i) => `
        <li>
          <em class="medal">${i + 1}</em>
          <span class="icon">${icon(w.condition, w.isDay)}</span>
          <span class="what"><strong>${dayOf(w, d, clock)} · ${clock.range(w.start, w.end, HOUR_MINUTE)}</strong><small>Feels like ${deg(w.feelsLike)}</small></span>
          <span class="chance ${band(w.precipitationChance)} num">${w.precipitationChance}%</span>
        </li>`,
    )
    .join("");
  return `<section class="panel"><h2>Best windows</h2><ol class="windows">${rows}</ol></section>`;
}

export function renderDryWindows(d: DryWindows, locale?: string): string {
  const clock = makeClock(locale);
  return `
    <article class="card enter">
      ${hero(d, clock)}
      ${strips(d, clock)}
      ${ranking(d, clock)}
      <p class="footer">Weather data by Open-Meteo.com · ${unitLabels[d.units].temperature}</p>
    </article>`;
}
