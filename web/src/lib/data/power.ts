/**
 * NASA POWER point client (https://power.larc.nasa.gov). The monthly point endpoint allows CORS,
 * so the browser fetches directly. Responses are cached in memory and in localStorage.
 */

export interface MonthlyPoint {
  year: number;
  month: number;
  value: number | null;
}

export interface PowerPointResult {
  lat: number;
  lon: number;
  elevation: number | null;
  params: Record<string, MonthlyPoint[]>;
  units: Record<string, string>;
  source: "live" | "cache" | "bundled";
}

const ENDPOINT = "https://power.larc.nasa.gov/api/temporal/monthly/point";
const memory = new Map<string, Promise<PowerPointResult>>();
const LS_PREFIX = "ts.power.v2.";

function key(lat: number, lon: number, params: string[], start: number, end: number) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}|${[...params].sort().join(",")}|${start}-${end}`;
}

/** Parse a POWER JSON response (also used for bundled case files). */
export function parsePower(json: unknown, source: PowerPointResult["source"]): PowerPointResult {
  const j = json as {
    geometry?: { coordinates?: number[] };
    properties?: { parameter?: Record<string, Record<string, number>> };
    parameters?: Record<string, { units?: string }>;
  };
  const coords = j.geometry?.coordinates ?? [];
  const raw = j.properties?.parameter ?? {};
  const params: Record<string, MonthlyPoint[]> = {};
  const units: Record<string, string> = {};
  for (const [name, byMonth] of Object.entries(raw)) {
    const pts: MonthlyPoint[] = [];
    for (const [ym, v] of Object.entries(byMonth)) {
      const month = Number(ym.slice(4));
      if (month < 1 || month > 12) continue; // "13" is the annual value
      pts.push({ year: Number(ym.slice(0, 4)), month, value: v <= -998 ? null : v });
    }
    pts.sort((a, b) => a.year - b.year || a.month - b.month);
    params[name] = pts;
    units[name] = j.parameters?.[name]?.units ?? "";
  }
  return {
    lon: coords[0] ?? NaN,
    lat: coords[1] ?? NaN,
    elevation: coords[2] ?? null,
    params,
    units,
    source,
  };
}

export function fetchPowerPoint(
  lat: number,
  lon: number,
  params: string[],
  start = 1981,
  end = new Date().getFullYear() - 1,
  signal?: AbortSignal,
): Promise<PowerPointResult> {
  const k = key(lat, lon, params, start, end);
  const hit = memory.get(k);
  if (hit) return hit;
  const p = (async () => {
    try {
      const stored = localStorage.getItem(LS_PREFIX + k);
      if (stored) return parsePower(JSON.parse(stored), "cache");
    } catch {
      /* storage unavailable */
    }
    const url = new URL(ENDPOINT);
    url.searchParams.set("parameters", params.slice(0, 20).join(","));
    url.searchParams.set("community", "AG");
    url.searchParams.set("latitude", lat.toFixed(4));
    url.searchParams.set("longitude", lon.toFixed(4));
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(end));
    url.searchParams.set("format", "JSON");
    // UTC matches the gridded archive and is required for IMERG precipitation.
    url.searchParams.set("time-standard", "UTC");
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`NASA POWER returned HTTP ${res.status}`);
    const json = await res.json();
    try {
      localStorage.setItem(LS_PREFIX + k, JSON.stringify(json));
    } catch {
      /* quota: ignore */
    }
    return parsePower(json, "live");
  })();
  p.catch(() => memory.delete(k));
  memory.set(k, p);
  return p;
}

export async function loadBundledCase(caseId: string): Promise<PowerPointResult | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/cases/${caseId}.json`);
    if (!res.ok) return null;
    return parsePower(await res.json(), "bundled");
  } catch {
    return null;
  }
}
