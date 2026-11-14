export function fmt(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const abs = Math.abs(v);
  const d = abs !== 0 && abs < 0.01 ? Math.max(decimals, 3) : decimals;
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function signed(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "–";
  const s = fmt(Math.abs(v), decimals);
  if (Number(s) === 0) return s;
  return (v > 0 ? "+" : "−") + s;
}

export function pValue(p: number): string {
  if (!Number.isFinite(p)) return "–";
  if (p < 0.0001) return "< 0.0001";
  if (p < 0.001) return p.toFixed(4);
  return p.toFixed(3);
}

/** Plain-language odds for a p-value. */
export function pWords(p: number): string {
  if (!Number.isFinite(p)) return "unknown";
  if (p < 0.001) return "less than 1 in 1,000";
  if (p < 0.01) return `about 1 in ${Math.round(1 / p).toLocaleString("en-US")}`;
  if (p < 0.1) return `about 1 in ${Math.round(1 / p)}`;
  if (p < 0.5) return `about ${Math.round(p * 10)} in 10`;
  return "more likely than not";
}

export function coord(lat: number, lon: number): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}° ${ns}  ${Math.abs(lon).toFixed(2)}° ${ew}`;
}

export function pct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}
