import type { Condition } from "../forecast";
import { CLOUD, INK } from "./icons";

// The animated sky behind the hero, one composition per weather condition.
// Layers are absolutely positioned inside `.backdrop` and only animate transform
// and opacity. Sizes, timings and keyframes live in view.html under "Backdrop".

/** Deterministic pseudo-random value in [0, 1), so the sky looks the same on every render. */
const scatter = (i: number, k: number) => (i * k) % 1;

// Translucent fills take on the colour of whatever sky is behind them.
const LIGHT = "rgba(255,255,255,.26)";
const FAINT = "rgba(255,255,255,.14)";
const DARK = "rgba(10,16,32,.3)";

// ---------- Layers ----------

/** Comic-book sunburst: uneven wedges that fade out, spinning slowly behind the buddy. */
function burst(): string {
  const wedges = Array.from({ length: 12 }, (_, i) => {
    const from = ((i * 30 + scatter(i, 0.618034) * 6) * Math.PI) / 180;
    const to = from + ((12 + scatter(i, 0.414214) * 6) * Math.PI) / 180;
    const point = (a: number) => `${(140 * Math.cos(a)).toFixed(1)},${(140 * Math.sin(a)).toFixed(1)}`;
    return `<polygon points="0,0 ${point(from)} ${point(to)}"/>`;
  }).join("");
  return (
    `<svg class="bd-burst" viewBox="-100 -100 200 200">` +
    `<defs><radialGradient id="bd-burst-fade" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="100">` +
    `<stop offset="0" style="stop-color:var(--burst);stop-opacity:.42"/><stop offset="1" style="stop-color:var(--burst);stop-opacity:0"/>` +
    `</radialGradient></defs><g fill="url(#bd-burst-fade)">${wedges}</g></svg>` +
    `<div class="bd-glow"></div>`
  );
}

/** A cartoon cloud drifting across. `top` is a percentage of the hero height, `size` its width in px. */
function cloud(o: { top: number; size: number; fill: string; seconds: number; reverse?: boolean }): string {
  // A negative delay starts it mid-flight, so the sky is already populated on first paint.
  const delay = (-o.seconds * scatter(o.top + o.size, 0.618034)).toFixed(1);
  return (
    `<div class="bd-cross${o.reverse ? " reverse" : ""}" style="top:${o.top}%;--w:${o.size}px;animation-duration:${o.seconds}s;animation-delay:${delay}s">` +
    `<svg viewBox="5 14 56 35"><path d="${CLOUD}" fill="${o.fill}" stroke="${INK}" stroke-opacity=".55" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg></div>`
  );
}

/** A strip of cloud bumps hanging from the top. One period is 400 wide and drawn twice. */
function bumps(period: Array<[width: number, depth: number]>, baseline: number): string {
  const edge = period.map(([w, d]) => `c${-w * 0.12} ${d} ${-w * 0.88} ${d} ${-w} 0`).join("");
  return `M0 0H800V${baseline}${edge}${edge}Z`;
}

const bankShapes = {
  back: bumps([[120, 36], [80, 24], [110, 40], [90, 28]], 28),
  front: bumps([[90, 30], [70, 20], [100, 34], [60, 18], [80, 26]], 24),
};

/** A cloud bank rolling along the top edge. Two of them at different speeds read as a churning sky. */
const bank = (shape: keyof typeof bankShapes, o: { fill: string; height: number; seconds: number }) =>
  `<svg class="bd-scroll" viewBox="0 0 800 60" preserveAspectRatio="none" style="top:-3px;height:${o.height}px;animation-duration:${o.seconds}s">` +
  `<path d="${bankShapes[shape]}" fill="${o.fill}" stroke="${INK}" stroke-opacity=".75" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;

const FOG_BAND =
  "M0 12q50-12 100 0t100 0t100 0t100 0t100 0t100 0t100 0t100 0V30q-50 10-100 0t-100 0t-100 0t-100 0t-100 0t-100 0t-100 0t-100 0Z";

/** Wavy fog bands sliding past each other in opposite directions. */
const fog = () =>
  [10, 27, 44, 61, 79]
    .map(
      (top, i) =>
        `<svg class="bd-scroll${i % 2 ? " reverse" : ""}" viewBox="0 0 800 42" preserveAspectRatio="none" style="top:${top}%;height:${46 + (i % 3) * 14}px;animation-duration:${24 + i * 7}s">` +
        `<path d="${FOG_BAND}" fill="#fff" opacity="${0.16 + (i % 3) * 0.08}"/></svg>`,
    )
    .join("");

/** Slanted rain streaks in two depths: a few fat fast ones up close, many thin ones behind. */
function rain(count: number, heavy: boolean): string {
  const streaks = Array.from({ length: count }, (_, i) => {
    const near = i % 3 === 0;
    const seconds = (heavy ? 0.5 : 1.05) * (near ? 0.8 : 1) + scatter(i, 0.31) * 0.3;
    return `<i style="left:${(scatter(i, 0.618034) * 140).toFixed(1)}%;width:${near ? 2.5 : 1.5}px;height:${near ? 36 : 20}px;opacity:${near ? 0.75 : 0.4};animation-duration:${seconds.toFixed(2)}s;animation-delay:-${(scatter(i, 0.7548) * 2).toFixed(2)}s"></i>`;
  }).join("");
  return `<div class="bd-rain${heavy ? " heavy" : ""}">${streaks}</div>`;
}

const BOLT = "M34 0L10 62h18L14 112h14L8 160 50 92H34L52 44H32L46 0Z";

/** A lightning bolt at `left` percent that strikes every `seconds`, lighting up the whole sky. */
function lightning(left: number, seconds: number, delay: number): string {
  const timing = `animation-duration:${seconds}s;animation-delay:${delay}s`;
  return (
    `<div class="bd-flash" style="${timing}"></div>` +
    `<svg class="bd-bolt" viewBox="-4 0 68 164" style="left:${left}%;${timing}"><path d="${BOLT}" fill="#ffe14d" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/></svg>`
  );
}

const FLAKE = [0, 60, 120]
  .map((a) => `<path transform="rotate(${a})" d="M0-8V8M0-8l-2.2 2.2M0-8l2.2 2.2M0 8l-2.2-2.2M0 8l2.2-2.2"/>`)
  .join("");

/** Falling snow: dots at three depths, a few big drawn flakes that spin, and drifts along the bottom. */
function snow(): string {
  const dots = Array.from({ length: 40 }, (_, i) => {
    const size = 3 + (i % 3) * 2.5;
    return `<i style="left:${(scatter(i, 0.618034) * 104 - 2).toFixed(1)}%;width:${size}px;height:${size}px;opacity:${0.45 + (i % 3) * 0.25};animation-duration:${(9 - (i % 3) * 2 + scatter(i, 0.53) * 2).toFixed(1)}s;animation-delay:-${(scatter(i, 0.7548) * 9).toFixed(1)}s"></i>`;
  }).join("");
  const flakes = Array.from({ length: 9 }, (_, i) => {
    const size = 16 + (i % 3) * 7;
    return `<b style="left:${(scatter(i, 0.381966) * 96).toFixed(1)}%;animation-duration:${(6 + scatter(i, 0.53) * 3).toFixed(1)}s;animation-delay:-${(scatter(i, 0.7548) * 8).toFixed(1)}s"><svg viewBox="-10 -10 20 20" width="${size}" height="${size}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round">${FLAKE}</svg></b>`;
  }).join("");
  return (
    `<div class="bd-snow">${dots}${flakes}</div>` +
    `<svg class="bd-drift" viewBox="0 0 800 50" preserveAspectRatio="none"><path d="M0 50V24c60-18 120-18 190 0s150 14 220-4s130-10 190 4s120 8 200-6V50Z" fill="#fff" stroke="${INK}" stroke-width="3" vector-effect="non-scaling-stroke"/></svg>`
  );
}

const SPARKLE = "M0-8Q1-1 8 0Q1 1 0 8Q-1 1-8 0Q-1-1 0-8Z";

/** A night sky: twinkling dots, a few four-point sparkles and the odd shooting star. */
function stars(): string {
  const dots = Array.from({ length: 46 }, (_, i) => {
    const size = 1.5 + (i % 3);
    return `<i style="left:${(scatter(i, 0.618034) * 100).toFixed(1)}%;top:${(scatter(i, 0.414214) * 78).toFixed(1)}%;width:${size}px;height:${size}px;animation-delay:-${(scatter(i, 0.7548) * 3).toFixed(1)}s"></i>`;
  }).join("");
  const sparkles = Array.from({ length: 6 }, (_, i) => {
    const size = 12 + (i % 3) * 5;
    return `<svg viewBox="-9 -9 18 18" width="${size}" height="${size}" style="left:${(8 + scatter(i, 0.618034) * 84).toFixed(1)}%;top:${(6 + scatter(i, 0.381966) * 58).toFixed(1)}%;animation-delay:-${(i * 0.6).toFixed(1)}s"><path d="${SPARKLE}" fill="#fff6c9"/></svg>`;
  }).join("");
  const shooting =
    `<i class="bd-shoot" style="left:72%;top:8%;animation-duration:6.5s"></i>` +
    `<i class="bd-shoot" style="left:46%;top:2%;animation-duration:9.5s;animation-delay:-4s"></i>`;
  return `<div class="bd-stars">${dots}${sparkles}${shooting}</div>`;
}

const GUST = "M2 20H80c16 0 18-16 6-16-7 0-8 8-2 9";

/** Wind swooshes that whip across every few seconds. */
const gusts = () =>
  [18, 47, 71]
    .map(
      (top, i) =>
        `<div class="bd-cross bd-gust" style="top:${top}%;--w:${130 + i * 30}px;animation-delay:-${(i * 1.7).toFixed(1)}s">` +
        `<svg viewBox="0 0 120 30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".55"><path d="${GUST}"/></svg></div>`,
    )
    .join("");

// ---------- Compositions ----------

/** The clouds every overcast sky shares: two rolling banks in the given colours. */
const overcast = (back: string, front: string, speed: number) =>
  bank("back", { fill: back, height: 98, seconds: 60 / speed }) +
  bank("front", { fill: front, height: 62, seconds: 34 / speed });

function sky(condition: Condition, isDay: boolean): string {
  const heavens = () => (isDay ? burst() : stars());
  switch (condition) {
    case "clear":
      return (
        heavens() +
        cloud({ top: 9, size: 96, fill: FAINT, seconds: 80 }) +
        cloud({ top: 64, size: 72, fill: FAINT, seconds: 110, reverse: true })
      );
    case "partly-cloudy":
      return (
        heavens() +
        cloud({ top: 5, size: 170, fill: LIGHT, seconds: 46 }) +
        cloud({ top: 36, size: 120, fill: FAINT, seconds: 70, reverse: true }) +
        cloud({ top: 56, size: 220, fill: LIGHT, seconds: 38 })
      );
    case "cloudy":
      return (
        cloud({ top: 40, size: 290, fill: FAINT, seconds: 72 }) +
        cloud({ top: 30, size: 230, fill: DARK, seconds: 50 }) +
        cloud({ top: 56, size: 180, fill: DARK, seconds: 36, reverse: true }) +
        (isDay ? overcast("#56657c", "#374356", 1) : overcast("#2a3445", "#161c27", 1))
      );
    case "fog":
      return cloud({ top: 20, size: 240, fill: DARK, seconds: 64 }) + fog();
    case "drizzle":
      return overcast("#4d5f78", "#33435a", 1) + rain(28, false);
    case "rain":
      return overcast("#394a61", "#1f2a3b", 1.6) + rain(66, true);
    case "snow":
      return (isDay ? overcast("#56739f", "#7892ba", 0.8) : overcast("#2c4067", "#465d87", 0.8)) + snow();
    case "thunder":
      return overcast("#3a2f6b", "#18122f", 2.2) + rain(66, true) + lightning(37, 5.3, 0) + lightning(64, 7.9, -3);
  }
}

/** The hero's animated sky for a condition. `windy` adds gusts on top of whatever the weather is. */
export const backdrop = (condition: Condition, isDay: boolean, windy: boolean) =>
  `<div class="backdrop" aria-hidden="true">${sky(condition, isDay)}${windy ? gusts() : ""}</div>`;
