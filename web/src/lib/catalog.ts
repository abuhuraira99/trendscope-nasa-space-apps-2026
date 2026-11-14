import type { RampKind } from "./color/ramps";

// Science text lives in content/variables.ts; loaded optionally so the app builds without it.
const contentModules = import.meta.glob("../content/variables.ts", { eager: true }) as Record<string, { VARIABLES?: unknown }>;
const VARIABLES = Object.values(contentModules)[0]?.VARIABLES ?? {};

export type Sphere = "heat" | "water" | "ice" | "air" | "life";

export interface VarInfo {
  id: string;
  name: string;
  shortName: string;
  sphere: Sphere;
  plain: string;
  whyItMatters: string;
  expert: string;
  unitsLabel: string;
  decimals: number;
  increaseWord: string;
  decreaseWord: string;
  ramp: RampKind;
  powerParam?: string;
  /** multiply live POWER point values by this to match the grid units */
  liveScale?: number;
  /** fixed colour scale (per decade) when the 2nd to 98th percentile range is dominated by a few regions */
  scale?: number;
  /** hide the automatic opposite-fates pair when the extremes are known artefacts */
  noTwins?: boolean;
  stat: "mean" | "sum";
  sourceLine: string;
  sourceUrl?: string;
  landOnly?: boolean;
}

/** Built-in essentials; the science text from content/variables.ts overrides these. */
const BASE: Record<string, Omit<VarInfo, "plain" | "whyItMatters" | "expert" | "sourceUrl">> = {
  t2m: { id: "t2m", name: "Air temperature", shortName: "Temperature", sphere: "heat", unitsLabel: "°C", decimals: 2, increaseWord: "warming", decreaseWord: "cooling", ramp: "warmUp", powerParam: "T2M", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  t2m_max: { id: "t2m_max", name: "Daytime high temperature", shortName: "Daily highs", sphere: "heat", unitsLabel: "°C", decimals: 2, increaseWord: "hotter days", decreaseWord: "cooler days", ramp: "warmUp", powerParam: "T2M_MAX_AVG", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  t2mwet: { id: "t2mwet", name: "Wet-bulb temperature", shortName: "Humid heat", sphere: "heat", unitsLabel: "°C", decimals: 2, increaseWord: "more humid heat", decreaseWord: "less humid heat", ramp: "warmUp", powerParam: "T2MWET", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  cdd: { id: "cdd", name: "Cooling degree days", shortName: "Cooling need", sphere: "heat", unitsLabel: "°C·days", decimals: 0, increaseWord: "more cooling needed", decreaseWord: "less cooling needed", ramp: "warmUp", powerParam: "CDD18_3", stat: "sum", sourceLine: "MERRA-2 via NASA POWER" },
  gistemp: { id: "gistemp", name: "Temperature anomaly (observed)", shortName: "GISTEMP", sphere: "heat", unitsLabel: "°C", decimals: 2, increaseWord: "warming", decreaseWord: "cooling", ramp: "warmUp", stat: "mean", sourceLine: "NASA GISS GISTEMP v4" },
  precip: { id: "precip", name: "Precipitation", shortName: "Rain and snow", sphere: "water", unitsLabel: "mm/day", decimals: 3, increaseWord: "wetter", decreaseWord: "drier", ramp: "coolUp", powerParam: "PRECTOTCORR", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  gpcp: { id: "gpcp", name: "Precipitation (observed)", shortName: "GPCP", sphere: "water", unitsLabel: "mm/day", decimals: 3, increaseWord: "wetter", decreaseWord: "drier", ramp: "coolUp", stat: "mean", sourceLine: "GPCP v2.3, NASA GSFC and NOAA" },
  soil: { id: "soil", name: "Root-zone soil wetness", shortName: "Soil water", sphere: "water", unitsLabel: "fraction", decimals: 3, increaseWord: "wetter soil", decreaseWord: "drying soil", ramp: "coolUp", powerParam: "GWETROOT", stat: "mean", sourceLine: "MERRA-2 via NASA POWER", landOnly: true },
  evap: { id: "evap", name: "Land evaporation", shortName: "Evaporation", sphere: "water", unitsLabel: "mm/day", decimals: 3, increaseWord: "more evaporation", decreaseWord: "less evaporation", ramp: "coolUp", powerParam: "EVLAND", stat: "mean", sourceLine: "MERRA-2 via NASA POWER", landOnly: true },
  pw: { id: "pw", name: "Water vapour in the air", shortName: "Water vapour", sphere: "water", unitsLabel: "cm", decimals: 3, increaseWord: "moister air", decreaseWord: "drier air", ramp: "coolUp", powerParam: "TQV", liveScale: 0.1, stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  snow: { id: "snow", name: "Snow cover", shortName: "Snow cover", sphere: "ice", unitsLabel: "fraction", decimals: 3, increaseWord: "more snow", decreaseWord: "less snow", ramp: "coolUp", powerParam: "FRSNO", stat: "mean", sourceLine: "MERRA-2 via NASA POWER", landOnly: true },
  seaice: { id: "seaice", name: "Sea ice", shortName: "Sea ice", sphere: "ice", unitsLabel: "fraction", decimals: 3, increaseWord: "more sea ice", decreaseWord: "less sea ice", ramp: "coolUp", powerParam: "FRSEAICE", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  ozone: { id: "ozone", name: "Total ozone", shortName: "Ozone", sphere: "air", unitsLabel: "DU", decimals: 1, increaseWord: "thicker ozone", decreaseWord: "thinner ozone", ramp: "ozone", powerParam: "TO3", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
  aod: { id: "aod", name: "Aerosol optical depth", shortName: "Haze", sphere: "air", unitsLabel: "", decimals: 3, increaseWord: "hazier", decreaseWord: "clearer", ramp: "aerosol", powerParam: "AOD_55_ADJ", stat: "mean", sourceLine: "CERES SYN1deg via NASA POWER" },
  cloud: { id: "cloud", name: "Cloud amount", shortName: "Clouds", sphere: "air", unitsLabel: "%", decimals: 2, increaseWord: "cloudier", decreaseWord: "clearer skies", ramp: "neutral", powerParam: "CLOUD_AMT", stat: "mean", sourceLine: "CERES SYN1deg via NASA POWER" },
  solar: { id: "solar", name: "Sunlight at the surface", shortName: "Sunlight", sphere: "air", unitsLabel: "MJ/m²/day", decimals: 3, increaseWord: "brighter", decreaseWord: "dimmer", ramp: "neutral", powerParam: "ALLSKY_SFC_SW_DWN", stat: "mean", sourceLine: "CERES SYN1deg via NASA POWER" },
  tws: { id: "tws", name: "Water stored on land", shortName: "Land water", sphere: "water", unitsLabel: "cm", decimals: 2, increaseWord: "gaining water", decreaseWord: "losing water", ramp: "coolUp", stat: "mean", sourceLine: "GRACE and GRACE-FO, NASA JPL", landOnly: true, scale: 30, noTwins: true },
  ndvi: { id: "ndvi", name: "Vegetation greenness", shortName: "Greenness", sphere: "life", unitsLabel: "NDVI", decimals: 4, increaseWord: "greening", decreaseWord: "browning", ramp: "vegetation", stat: "mean", sourceLine: "MODIS Terra, NASA LP DAAC", landOnly: true },
  wind: { id: "wind", name: "Wind speed", shortName: "Wind", sphere: "air", unitsLabel: "m/s", decimals: 3, increaseWord: "windier", decreaseWord: "calmer", ramp: "neutral", powerParam: "WS10M", stat: "mean", sourceLine: "MERRA-2 via NASA POWER" },
};

export const SPHERES: { id: Sphere; label: string }[] = [
  { id: "heat", label: "Heat" },
  { id: "water", label: "Water" },
  { id: "ice", label: "Ice" },
  { id: "air", label: "Air" },
  { id: "life", label: "Life" },
];

type ContentEntry = Partial<{
  name: string;
  shortName: string;
  plain: string;
  whyItMatters: string;
  expert: string;
  unitsLabel: string;
  decimals: number;
  increaseWord: string;
  decreaseWord: string;
  source: { mission?: string; product?: string; provider?: string; url?: string };
}>;

const content = VARIABLES as unknown as Record<string, ContentEntry | undefined>;

const cache = new Map<string, VarInfo>();

export function info(id: string): VarInfo {
  const hit = cache.get(id);
  if (hit) return hit;
  const base = BASE[id] ?? {
    id,
    name: id,
    shortName: id,
    sphere: "air" as Sphere,
    unitsLabel: "",
    decimals: 2,
    increaseWord: "increasing",
    decreaseWord: "decreasing",
    ramp: "neutral" as RampKind,
    stat: "mean" as const,
    sourceLine: "NASA",
  };
  const c = content[id] ?? {};
  const v: VarInfo = {
    ...base,
    name: c.name ?? base.name,
    shortName: c.shortName ?? base.shortName,
    plain: c.plain ?? "",
    whyItMatters: c.whyItMatters ?? "",
    expert: c.expert ?? "",
    unitsLabel: c.unitsLabel ?? base.unitsLabel,
    decimals: c.decimals ?? base.decimals,
    increaseWord: c.increaseWord ?? base.increaseWord,
    decreaseWord: c.decreaseWord ?? base.decreaseWord,
    sourceUrl: c.source?.url,
  };
  cache.set(id, v);
  return v;
}

export const ALL_IDS = Object.keys(BASE);

/** Colour scale for a variable's trend map: half-width of the diverging ramp, per decade. */
export function slopeScaleFor(m: { id: string; slopeRange: [number, number] }): number {
  const fixed = info(m.id).scale;
  if (fixed) return fixed;
  const s = Math.max(Math.abs(m.slopeRange[0]), Math.abs(m.slopeRange[1]));
  return s > 0 ? s : 1;
}
