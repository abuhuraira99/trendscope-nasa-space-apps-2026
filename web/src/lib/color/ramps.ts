/**
 * Dark-centred diverging ramps. "No change" sits near the ground colour so the map stays quiet,
 * and strong trends carry the colour. Shapes follow Crameri's perceptually uniform scientific
 * colour maps (berlin, managua), adapted to this palette; both ends stay distinguishable for the
 * common forms of colour blindness because they differ in lightness as well as hue.
 */

export type RampKind = "warmUp" | "coolUp" | "ozone" | "aerosol" | "vegetation" | "neutral";

type Stop = [number, string];

const RAMPS: Record<RampKind, Stop[]> = {
  // increase = warm (temperature, heat stress, cooling demand)
  warmUp: [
    [0, "#c4d6ff"],
    [0.12, "#6fa8dc"],
    [0.24, "#2f6d97"],
    [0.36, "#1d3f57"],
    [0.47, "#171d23"],
    [0.53, "#2a1814"],
    [0.64, "#6b1d1a"],
    [0.76, "#b23a26"],
    [0.88, "#e9803a"],
    [1, "#fbe2a0"],
  ],
  // increase = cool / wet (precipitation, soil water, snow, sea ice): decrease shows warm
  coolUp: [
    [0, "#ffd889"],
    [0.16, "#d38a35"],
    [0.33, "#6e3f17"],
    [0.47, "#241d16"],
    [0.53, "#13201f"],
    [0.67, "#14595f"],
    [0.84, "#33a5b0"],
    [1, "#a6f1f2"],
  ],
  // ozone: thinning amber, thickening sea green
  ozone: [
    [0, "#ffd36e"],
    [0.18, "#d98c2b"],
    [0.36, "#6b3b12"],
    [0.5, "#1b1d1f"],
    [0.64, "#1c4a3a"],
    [0.82, "#3e9b78"],
    [1, "#b4f0cf"],
  ],
  // aerosol: cleaner air sea-blue, hazier air rust
  aerosol: [
    [0, "#a9e3ff"],
    [0.18, "#4d9cc9"],
    [0.36, "#1d4560"],
    [0.5, "#1b1d20"],
    [0.64, "#5a3b1d"],
    [0.82, "#b9783a"],
    [1, "#ffd59c"],
  ],
  // vegetation: browning amber-brown, greening leaf green
  vegetation: [
    [0, "#ffd08a"],
    [0.18, "#c9822f"],
    [0.36, "#5c3a17"],
    [0.5, "#1c1d1a"],
    [0.64, "#26461f"],
    [0.82, "#5fa04a"],
    [1, "#c8f2a4"],
  ],
  neutral: [
    [0, "#bfc6d0"],
    [0.3, "#5d6672"],
    [0.5, "#1c2026"],
    [0.7, "#6e665a"],
    [1, "#e8dcc6"],
  ],
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Interpolate in linear-light space for smoother perceptual blends.
const toLin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number) => {
  const s = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, s)) * 255);
};

const lutCache = new Map<RampKind, Uint8Array>();

/** 256-entry RGBA lookup table. Index 0 = most negative, 255 = most positive. */
export function rampLUT(kind: RampKind): Uint8Array {
  const hit = lutCache.get(kind);
  if (hit) return hit;
  const stops = RAMPS[kind];
  const lut = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k];
    const [t1, c1] = stops[k + 1];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const a = hexToRgb(c0).map(toLin);
    const b = hexToRgb(c1).map(toLin);
    lut[i * 4] = toSrgb(a[0] + (b[0] - a[0]) * f);
    lut[i * 4 + 1] = toSrgb(a[1] + (b[1] - a[1]) * f);
    lut[i * 4 + 2] = toSrgb(a[2] + (b[2] - a[2]) * f);
    lut[i * 4 + 3] = 255;
  }
  lutCache.set(kind, lut);
  return lut;
}

export function rampCss(kind: RampKind, direction = "to right"): string {
  const stops = RAMPS[kind].map(([t, c]) => `${c} ${(t * 100).toFixed(1)}%`).join(", ");
  return `linear-gradient(${direction}, ${stops})`;
}

/** Colour for a normalised value in [-1, 1]. */
export function rampColor(kind: RampKind, v: number): string {
  const lut = rampLUT(kind);
  const i = Math.round(((Math.max(-1, Math.min(1, v)) + 1) / 2) * 255) * 4;
  return `rgb(${lut[i]} ${lut[i + 1]} ${lut[i + 2]})`;
}

export function rampForKind(rampKind: string | undefined, increaseIsCool: boolean): RampKind {
  switch (rampKind) {
    case "temperature":
      return "warmUp";
    case "wetness":
    case "ice":
      return "coolUp";
    case "ozone":
      return "ozone";
    case "aerosol":
      return "aerosol";
    default:
      return increaseIsCool ? "coolUp" : "neutral";
  }
}
