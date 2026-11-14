/**
 * Loaders for the precomputed global products in /data (see docs/build-spec.md).
 * Grids are gzip-compressed typed arrays, decompressed in the browser with DecompressionStream.
 */

export interface GridGeom {
  lat0: number;
  dlat: number;
  nlat: number;
  lon0: number;
  dlon: number;
  nlon: number;
}

export interface Extreme {
  lat: number;
  lon: number;
  slope: number;
  p: number;
}

export interface VarMeta {
  id: string;
  param?: string;
  source?: string;
  units: string;
  years: [number, number];
  grid: GridGeom;
  seriesScale: number;
  seriesOffset: number;
  valueRange: [number, number];
  slopeRange: [number, number];
  summary: {
    validCells: number;
    sigUp: number;
    sigDown: number;
    fdrUp: number;
    fdrDown: number;
    areaWeightedMeanSlope: number;
    [k: string]: number;
  };
  extremes: { up: Extreme[]; down: Extreme[] };
}

export interface VarsFile {
  generated: string;
  period: [number, number];
  vars: VarMeta[];
}

export interface TrendGrid {
  meta: VarMeta;
  slope: Float32Array;
  p: Float32Array;
  mean: Float32Array;
  sig: Float32Array;
}

export interface SeriesGrid {
  meta: VarMeta;
  years: number[];
  data: Int16Array;
}

const BASE = `${import.meta.env.BASE_URL}data`;

let varsPromise: Promise<VarsFile> | null = null;
const trendCache = new Map<string, Promise<TrendGrid>>();
const seriesCache = new Map<string, Promise<SeriesGrid>>();

export function loadVars(): Promise<VarsFile> {
  if (!varsPromise) {
    varsPromise = fetch(`${BASE}/vars.json`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`vars.json: HTTP ${r.status}`);
      return r.json() as Promise<VarsFile>;
    });
  }
  return varsPromise;
}

async function fetchGzip(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  // Some hosts transparently decode .gz when served with Content-Encoding; detect by magic bytes.
  const raw = await res.arrayBuffer();
  const head = new Uint8Array(raw, 0, Math.min(2, raw.byteLength));
  if (head[0] !== 0x1f || head[1] !== 0x8b) return raw;
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export function loadTrend(meta: VarMeta): Promise<TrendGrid> {
  let p = trendCache.get(meta.id);
  if (!p) {
    p = fetchGzip(`${BASE}/grid/${meta.id}.trend.bin.gz`).then((buf) => {
      const n = meta.grid.nlat * meta.grid.nlon;
      const all = new Float32Array(buf);
      if (all.length !== 4 * n) throw new Error(`${meta.id}: trend grid has ${all.length}, expected ${4 * n}`);
      return {
        meta,
        slope: all.subarray(0, n),
        p: all.subarray(n, 2 * n),
        mean: all.subarray(2 * n, 3 * n),
        sig: all.subarray(3 * n, 4 * n),
      };
    });
    p.catch(() => trendCache.delete(meta.id));
    trendCache.set(meta.id, p);
  }
  return p;
}

export function loadSeries(meta: VarMeta): Promise<SeriesGrid> {
  let p = seriesCache.get(meta.id);
  if (!p) {
    p = fetchGzip(`${BASE}/grid/${meta.id}.series.bin.gz`).then((buf) => {
      const years: number[] = [];
      for (let y = meta.years[0]; y <= meta.years[1]; y++) years.push(y);
      return { meta, years, data: new Int16Array(buf) };
    });
    p.catch(() => seriesCache.delete(meta.id));
    seriesCache.set(meta.id, p);
  }
  return p;
}

/** Nearest grid cell index for a coordinate, or -1 when outside the grid. */
export function cellIndex(g: GridGeom, lat: number, lon: number): number {
  const offset = (((lon - g.lon0) % 360) + 360) % 360;
  const col = Math.round(offset / g.dlon) % g.nlon;
  const row = Math.round((lat - g.lat0) / g.dlat);
  if (row < 0 || row >= g.nlat) return -1;
  return row * g.nlon + col;
}

export function cellCenter(g: GridGeom, idx: number): { lat: number; lon: number } {
  const row = Math.floor(idx / g.nlon);
  const col = idx % g.nlon;
  return { lat: g.lat0 + row * g.dlat, lon: g.lon0 + col * g.dlon };
}

/** Annual series of one cell, missing values as null. */
export function cellSeries(s: SeriesGrid, idx: number): { years: number[]; values: (number | null)[] } {
  const y = s.years.length;
  const out: (number | null)[] = new Array(y);
  for (let k = 0; k < y; k++) {
    const v = s.data[idx * y + k];
    out[k] = v === -32768 ? null : v * s.meta.seriesScale + s.meta.seriesOffset;
  }
  return { years: s.years, values: out };
}
