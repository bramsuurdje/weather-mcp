import type { Condition } from "../forecast";

// Hand-drawn cartoon art for the widget: marker-pen outlines, flat fills, goofy faces.
// Weather characters are drawn in a 64×64 box, the buddy in a 100×104 box and the
// hero scene in a 144×122 box. Everything returns SVG contents; the caller supplies
// the <svg> wrapper and its viewBox.

export const INK = "#1b1b22";
const TONGUE = "#ff8f6b";
const WATER = "#6cc5ff";
const SCARF = "#e5484d";

/** Wraps shapes in the marker-pen outline every drawing shares. */
const inked = (content: string) =>
  `<g fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${content}</g>`;

/** A line that stays readable on any sky: a coloured stroke on top of a fatter ink stroke. */
const outlined = (d: string, color: string, width: number) =>
  `<path d="${d}" stroke-width="${width + 2.6}"/><path d="${d}" stroke="${color}" stroke-width="${width}"/>`;

const dot = (cx: number, cy: number, r: number) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${INK}" stroke="none"/>`;

/** A googly eye: white ball, pupil offset by (px, py), and an optional heavy eyelid. */
function eye(
  cx: number,
  cy: number,
  r: number,
  { px = 0, py = 0, lid }: { px?: number; py?: number; lid?: string } = {},
): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/>` +
    dot(cx + px, cy + py, Math.max(r * 0.22, 1.1)) +
    (lid ? `<path d="M${cx - r} ${cy}a${r} ${r} 0 0 1 ${2 * r} 0z" fill="${lid}"/>` : "")
  );
}

/** A teardrop with its tip at (x, y). `className` picks the animation (rain or sweat). */
function drop(x: number, y: number, scale: number, className: string, delay: number): string {
  const w = 2.6 * scale;
  const h = 7 * scale;
  return `<path class="${className}" style="animation-delay:${delay}s" d="M${x} ${y}c${-w} ${h / 2} ${-w} ${h} 0 ${h}s${w} ${-h / 2} 0 ${-h}z" fill="${WATER}" stroke-width="1.8"/>`;
}

// ---------- Weather characters (64×64) ----------

/** The cloud outline every cloud in the widget shares (64×64 box). */
export const CLOUD =
  "M17 46C7 46 6 33 15 32C13 22 25 18 30 25C34 14 49 16 49 28C58 27 61 40 52 45C50 46 48 46 46 46Z";

const cloudFaces = {
  happy:
    dot(26, 33.5, 1.9) +
    dot(39, 33.5, 1.9) +
    `<path d="M27.5 37.5h10c0 6.5-10 6.5-10 0z" fill="${INK}"/>` +
    `<path d="M30 41.3c1.5-1.4 3.5-1.4 5 0-.8 1.3-4.2 1.3-5 0z" fill="${TONGUE}" stroke="none"/>`,
  bored:
    eye(26, 34, 4.2, { px: 1.3, py: 1.7, lid: "#dfe5ec" }) +
    eye(39, 34.5, 3.3, { px: 1, py: 1.4, lid: "#dfe5ec" }) +
    `<path d="M29 41.8q3.5-1.6 7 .4"/>`,
  derpy:
    eye(25.5, 33.5, 4.6, { px: -1.6, py: 1.2 }) +
    eye(39, 34.5, 3, { px: 1, py: -0.9 }) +
    dot(32.5, 41.2, 1.9),
  worried:
    `<path d="M21.5 30.5l6-2.5M43.5 30.5l-6-2.5"/>` +
    dot(26, 34.5, 1.8) +
    dot(39, 34.5, 1.8) +
    `<path d="M28.5 42q4-3.6 8 0"/>`,
  crying:
    `<path d="M22.5 31.5l5.5 2.5-5.5 2.5M42.5 31.5l-5.5 2.5 5.5 2.5"/>` +
    `<path d="M27.5 43.5c0-7 10-7 10 0z" fill="${INK}"/>` +
    `<path d="M30 43c1.2-2 3.8-2 5 0z" fill="${TONGUE}" stroke="none"/>`,
  freezing:
    eye(26, 33.5, 3.8) +
    eye(39, 33.5, 3.8) +
    `<path d="M27 38.5h11v5.5h-11z" fill="#fff"/>` +
    `<path d="M27 41.2h11M30.7 38.5v5.5M34.3 38.5v5.5" stroke-width="1.4"/>`,
  angry:
    `<path d="M20.5 28.5l8.5 3.5M44.5 28.5l-8.5 3.5" stroke-width="3"/>` +
    eye(26.5, 35, 3, { py: 0.4 }) +
    eye(38.5, 35, 3, { py: 0.4 }) +
    `<path d="M27.5 44c.5-5.5 9.5-5.5 10 0z" fill="${INK}"/>`,
} as const satisfies Record<string, string>;

const cloud = (face: keyof typeof cloudFaces, fill = "#fff") =>
  `<path d="${CLOUD}" fill="${fill}"/><g stroke-width="2">${cloudFaces[face]}</g>`;

/** The sun: spiky rays that spin, oversized crooked sunglasses and a big grin. */
function sun(): string {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const angle = (i * Math.PI) / 12;
    // Uneven tips, like a marker drawing.
    const radius = i % 2 ? 18 : 26 + ((i * 5) % 7) * 0.4;
    return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
  return (
    `<g transform="translate(32 32)"><polygon class="spin" points="${rays}" fill="#ff9f1a"/></g>` +
    `<circle cx="32" cy="32" r="15" fill="#ffd23f"/>` +
    `<g transform="rotate(-6 32 30)">` +
    `<path d="M17.5 26.5L31 26V30C31 36 19 36.5 18 30Z" fill="${INK}"/>` +
    `<path d="M33 26L46.5 26.5L46 30C45 36.5 33 36 33 30Z" fill="${INK}"/>` +
    `<path d="M31 27.5H33" stroke-width="2.4"/>` +
    `<path d="M21.5 28l2.4 3.4M25.2 27.6l1.8 2.6M36.8 28l2.4 3.4" stroke="#fff" stroke-width="1.3"/>` +
    `</g>` +
    `<path d="M25 38.5C27.5 45 36.5 45 39 38.5Z" fill="${INK}" stroke-width="2"/>` +
    `<path d="M29 42.2c1.8-1.8 4.6-1.8 6.4 0-1.6 1.5-4.8 1.5-6.4 0z" fill="${TONGUE}" stroke="none"/>`
  );
}

/** The moon: a fat crescent, fast asleep. */
const moon = () =>
  `<path d="M30.3 14A20 20 0 1 0 49 40.3A17 17 0 0 1 30.3 14Z" fill="#ffe9a8"/>` +
  `<ellipse cx="16.5" cy="40" rx="2.6" ry="1.7" fill="#ffb199" stroke="none"/>` +
  `<g stroke-width="2.2"><path d="M17 34q3.5 3 7 0"/><path d="M21 43.5q4 3 8-.5"/></g>` +
  `<g class="zzz">${outlined("M38 24h7l-7 8h7", "#fff", 1.8)}${outlined("M50 11h5l-5 6h5", "#fff", 1.6)}</g>`;

/** SVG contents for a weather condition, drawn in a 64×64 box. */
export function weatherIcon(condition: Condition, isDay: boolean): string {
  const sky = isDay ? sun() : moon();
  switch (condition) {
    case "clear":
      return inked(sky);
    case "partly-cloudy":
      return inked(
        `<g transform="scale(.74)">${sky}</g>` +
          `<g transform="translate(5 13)"><g class="float">${cloud("happy")}</g></g>`,
      );
    case "cloudy":
      return inked(
        `<g transform="translate(16 2) scale(.72)"><path d="${CLOUD}" fill="#c3ccd8"/></g>` +
          `<g transform="translate(-2 6)"><g class="float">${cloud("bored")}</g></g>`,
      );
    case "fog":
      return inked(
        `<g transform="translate(0 -6)">${cloud("derpy", "#eef2f6")}</g>` +
          `<g class="float">${outlined("M9 47q5.5-4 11 0t11 0t11 0t11 0", "#eef2f6", 3.4)}${outlined("M15 55.5q5.5-4 11 0t11 0t11 0", "#eef2f6", 3.4)}</g>`,
      );
    case "drizzle":
      return inked(
        [drop(22, 43, 1.1, "drop", 0), drop(34, 46, 1.1, "drop", 0.4), drop(45, 43, 1.1, "drop", 0.75)].join("") +
          `<g transform="translate(0 -6)">${cloud("worried")}</g>`,
      );
    case "rain":
      return inked(
        [17, 27, 38, 48].map((x, i) => drop(x, i % 2 ? 46 : 42, 1.3, "drop", i * 0.27)).join("") +
          `<g transform="translate(0 -7)">${cloud("crying", "#dce6f2")}</g>`,
      );
    case "snow":
      return inked(
        [18, 29, 40, 50]
          .map(
            (x, i) =>
              `<circle class="drop slow" style="animation-delay:${i * 0.45}s" cx="${x}" cy="${i % 2 ? 53 : 48}" r="3.2" fill="#fff" stroke-width="2"/>`,
          )
          .join("") + `<g transform="translate(0 -7)">${cloud("freezing", "#ddf1ff")}</g>`,
      );
    case "thunder":
      return inked(
        `<path class="flash" d="M35 37L25 50h7l-4 11 14-16h-7l4-8z" fill="#ffd21f" stroke-width="2.4"/>` +
          `<g transform="translate(0 -8)">${cloud("angry", "#8891a8")}</g>`,
      );
  }
}

// ---------- The buddy (100×104) ----------

export type TemperatureMood = "melting" | "chill" | "comfy" | "cold" | "frozen";
/** Every face the buddy can pull. "sick" is for bad air, the rest follow the temperature. */
export type Mood = TemperatureMood | "sick";

/** Picks the buddy's mood from the feels-like temperature in °C. */
export const moodFor = (feelsLikeCelsius: number): TemperatureMood =>
  feelsLikeCelsius >= 27
    ? "melting"
    : feelsLikeCelsius >= 18
      ? "chill"
      : feelsLikeCelsius >= 8
        ? "comfy"
        : feelsLikeCelsius >= 0
          ? "cold"
          : "frozen";

const shiverMarks = `<g class="blink">${outlined("M9 46q-5 8 0 16", "#fff", 2.2)}${outlined("M91 46q5 8 0 16", "#fff", 2.2)}</g>`;

// `behind` is drawn under the head, `features` on top of it.
const buddies: Record<Mood, { skin: string; behind: string; features: string; shivers: boolean }> = {
  melting: {
    skin: "#ffb52e",
    shivers: false,
    behind:
      `<ellipse cx="52" cy="99" rx="31" ry="3.4" fill="#8ad4ff" stroke="none"/>` +
      `<ellipse cx="17" cy="101.5" rx="7" ry="1.7" fill="#8ad4ff" stroke="none"/>` +
      `<g stroke="#ff6b6b" stroke-width="3.2">${[-27, -17, -7]
        .map((x, i) => `<path class="heat" style="animation-delay:${i * 0.5}s" d="M${x} 50q5 7 0 14t0 14t0 14"/>`)
        .join("")}</g>`,
    features:
      `<path d="M26 17q8-6 15-1" stroke-width="5"/>` +
      eye(36, 38, 14, { px: 6, py: 2 }) +
      eye(67, 45, 9.5, { px: -2, py: 4, lid: "#f29a0e" }) +
      `<path d="M60 31q8-4 15 1" stroke-width="5"/>` +
      `<path d="M27 78C27 51 73 51 73 78Z" fill="${INK}"/>` +
      `<path d="M40 77C40 68 60 68 60 77V85C60 97 40 97 40 85Z" fill="${TONGUE}"/>` +
      `<path d="M50 74V86" stroke-width="2.4"/>` +
      drop(20, 50, 1.5, "sweat", 0) +
      drop(82, 58, 1.4, "sweat", 0.5) +
      drop(78, 27, 1.2, "sweat", 0.9) +
      drop(24, 72, 1.1, "sweat", 1.3) +
      drop(77, 74, 1, "sweat", 0.2),
  },
  chill: {
    skin: "#ffc629",
    shivers: false,
    behind: "",
    features:
      `<path d="M57 27q9-6 17 0" stroke-width="4.5"/>` +
      `<g transform="rotate(-5 50 44)">` +
      `<path d="M21 37L48 35.5V45C48 57 24 59 22.5 47Z" fill="${INK}"/>` +
      `<path d="M52 35.5L79 37L77.5 47C76 59 52 57 52 45Z" fill="${INK}"/>` +
      `<path d="M48 38.5H52M21 38l-4-2M79 38l4-2" stroke-width="4"/>` +
      `<path d="M28 40.5l4.5 7.5M34 40l3.5 6M59 40l4.5 7.5" stroke="#fff" stroke-width="2.2"/>` +
      `</g>` +
      `<path d="M33 64C36 84 64 84 67 64Z" fill="#fff"/>` +
      `<path d="M36.5 71.5H63.5M42 64.5v11.5M50 64.5v14M58 64.5v11.5" stroke-width="2"/>`,
  },
  comfy: {
    skin: "#ffc629",
    shivers: false,
    behind: "",
    features:
      `<path d="M27 26q8-6 16-2" stroke-width="4.5"/>` +
      eye(37, 43, 10.5, { px: 3, py: 1.5 }) +
      `<path d="M57 45q7.5-9 15 0" stroke-width="4"/>` +
      `<ellipse cx="25" cy="60" rx="5.5" ry="3.5" fill="${TONGUE}" opacity=".55" stroke="none"/>` +
      `<ellipse cx="76" cy="58" rx="5.5" ry="3.5" fill="${TONGUE}" opacity=".55" stroke="none"/>` +
      `<path d="M31 62C35 81 65 81 69 62Z" fill="${INK}"/>` +
      `<path d="M51 71c0-6 15-6 15 0v7c0 9-15 9-15 0z" fill="${TONGUE}"/>` +
      `<path d="M58.5 70.5v8.5" stroke-width="2.2"/>`,
  },
  cold: {
    skin: "#ffe08a",
    shivers: true,
    behind: shiverMarks,
    features:
      `<path d="M25 31l13-4.5M75 31l-13-4.5" stroke-width="4.5"/>` +
      eye(37, 44, 10, { py: 1 }) +
      eye(63, 44, 10, { py: 1 }) +
      `<path d="M33 67l5.5-5 5.5 5 5.5-5 5.5 5 5.5-5 5.5 5" stroke-width="3.5"/>` +
      `<path d="M64 88l11 14-11 2-6-13z" fill="${SCARF}"/>` +
      `<path d="M18 73C34 85 66 85 82 73L85 83C68 97 32 97 15 83Z" fill="${SCARF}"/>` +
      `<path d="M31 80.5l-2 9M50 84v9.5M69 80.5l2 9" stroke="#fff" stroke-width="2"/>`,
  },
  frozen: {
    skin: "#a9dcff",
    shivers: true,
    behind: shiverMarks + `<path d="M33 82l3.5 15 3.5-14zM58 84l3 12 3-13z" fill="#e3f5ff" stroke-width="2.4"/>`,
    features:
      `<path d="M19.5 40C19 10 81 10 80.5 40Z" fill="${SCARF}"/>` +
      `<path d="M34 23l3 11M50 19v15M66 23l-3 11" stroke-width="2" opacity=".35"/>` +
      `<circle cx="50" cy="14" r="7.5" fill="#fff"/>` +
      `<rect x="14" y="34" width="72" height="12" rx="6" fill="#fff"/>` +
      `<path d="M21 46l3 11 3-11zM73 46l3 12 3-12z" fill="#e3f5ff" stroke-width="2.4"/>` +
      eye(38, 58, 8.5) +
      eye(62, 58, 8.5) +
      `<rect x="35" y="71" width="30" height="11" rx="3" fill="#fff"/>` +
      `<path d="M35 76.5H65M42.5 71v11M50 71v11M57.5 71v11" stroke-width="2"/>`,
  },
  sick: {
    skin: "#b9d96a",
    shivers: false,
    // Stink lines rising off the head.
    behind: `<g stroke="#5f6f2e" stroke-width="3">${[28, 50, 72]
      .map((x, i) => `<path class="heat" style="animation-delay:${i * 0.5}s" d="M${x} 16q5-4 0-8t0-8"/>`)
      .join("")}</g>`,
    features:
      `<path d="M26 35l13-6M74 35l-13-6" stroke-width="4.5"/>` +
      `<path d="M29 40l11 10M40 40l-11 10M60 40l11 10M71 40l-11 10" stroke-width="4"/>` +
      `<ellipse cx="25" cy="62" rx="6" ry="4" fill="#8fb543" stroke="none"/>` +
      `<ellipse cx="75" cy="62" rx="6" ry="4" fill="#8fb543" stroke="none"/>` +
      `<path d="M33 69q4.25-6 8.5 0t8.5 0t8.5 0t8.5 0" stroke-width="3.5"/>` +
      drop(80, 34, 1.2, "sweat", 0.3),
  },
};

// Sits behind the head like an oversized hat.
const umbrella =
  `<path d="M50 5V-1" stroke-width="3.5"/>` +
  `<path d="M6 30C10-4 90-4 94 30q-11-8-22 0q-11-8-22 0q-11-8-22 0q-11-8-22 0z" fill="#2ec4b6"/>` +
  `<path d="M50 5L28 30M50 5V30M50 5L72 30" stroke-width="2" opacity=".4"/>`;

/** SVG contents for the buddy, the emoji face that reacts to how it feels outside. */
export function buddy(mood: Mood, hasUmbrella: boolean): string {
  const { skin, behind, features, shivers } = buddies[mood];
  return inked(
    `${behind}<g${shivers ? ' class="shiver"' : ""}>${hasUmbrella ? umbrella : ""}<circle cx="50" cy="54" r="34" fill="${skin}"/>${features}</g>`,
  );
}

const wet: readonly Condition[] = ["drizzle", "rain", "thunder"];

/**
 * The hero drawing (144×122): the buddy reacting to the weather, with the weather
 * character in the corner. The character is drawn last so its rain lands on the umbrella.
 */
export const scene = (condition: Condition, isDay: boolean, mood: Mood) =>
  `<g class="boil">` +
  `<g transform="translate(42 16)">${buddy(mood, wet.includes(condition))}</g>` +
  `<svg width="62" height="62" viewBox="0 0 64 64" overflow="visible">${weatherIcon(condition, isDay)}</svg>` +
  `</g>`;
