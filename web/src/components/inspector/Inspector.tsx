import { useEffect, useMemo, useState } from "react";
import { X, Download, Link2, Globe2 } from "lucide-react";
import { useAtlas, type Place } from "../../state/store";
import { cellIndex, cellSeries, loadSeries, loadTrend, type TrendGrid, type VarMeta } from "../../lib/data/grids";
import { fetchPowerPoint, type PowerPointResult } from "../../lib/data/power";
import { info, slopeScaleFor } from "../../lib/catalog";
import { reverseName } from "../../lib/geocode";
import { analyzeAnnual, analyzeMonthly, deseasonalize, type AnnualResult, type MonthlyAnalysis } from "../../lib/stats";
import { rampColor, rampCss } from "../../lib/color/ramps";
import { coord, fmt, pEq, pValue, pWords, signed } from "../../lib/format";
import TrendChart from "../charts/TrendChart";
import SeasonBars from "../charts/SeasonBars";
import "./inspector.css";

interface Props {
  place: Place;
  metas: VarMeta[];
  globeVar: string;
  onClose: () => void;
  onShowOnGlobe: (id: string) => void;
}

interface ScanRow {
  id: string;
  slope: number;
  p: number;
  sig: number;
}

const PAIRS: Record<string, string> = { t2m: "gistemp", gistemp: "t2m", precip: "gpcp", gpcp: "precip" };

const slopeScale = slopeScaleFor;

export default function Inspector({ place, metas, globeVar, onClose, onShowOnGlobe }: Props) {
  const focusVar = useAtlas((s) => s.focusVar) ?? globeVar;
  const setFocusVar = useAtlas((s) => s.setFocusVar);
  const [name, setName] = useState<string | null>(place.name ?? null);
  const [scan, setScan] = useState<Map<string, ScanRow | null>>(new Map());
  const [annual, setAnnual] = useState<{ id: string; years: number[]; values: (number | null)[]; res: AnnualResult } | null>(null);
  const [live, setLive] = useState<{ status: "loading" | "ready" | "error"; data?: PowerPointResult }>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [windowKey, setWindowKey] = useState("all");

  const meta = metas.find((m) => m.id === focusVar) ?? metas.find((m) => m.id === globeVar)!;
  const vi = info(meta.id);

  // Place name
  useEffect(() => {
    let alive = true;
    setName(place.name ?? null);
    if (!place.name) reverseName(place.lat, place.lon).then((n) => alive && setName(n));
    return () => {
      alive = false;
    };
  }, [place]);

  // Scan every variable's trend map at this cell; rows appear as each map arrives.
  useEffect(() => {
    let alive = true;
    setScan(new Map());
    for (const m of metas) {
      loadTrend(m)
        .then((g: TrendGrid) => {
          if (!alive) return;
          const i = cellIndex(m.grid, place.lat, place.lon);
          const row = i >= 0 && Number.isFinite(g.slope[i]) ? { id: m.id, slope: g.slope[i], p: g.p[i], sig: g.sig[i] } : null;
          setScan((prev) => new Map(prev).set(m.id, row));
        })
        .catch(() => alive && setScan((prev) => new Map(prev).set(m.id, null)));
    }
    return () => {
      alive = false;
    };
  }, [metas, place.lat, place.lon]);

  // Annual series for the focused variable (same data as the map).
  useEffect(() => {
    let alive = true;
    setAnnual(null);
    loadSeries(meta).then((s) => {
      if (!alive) return;
      const i = cellIndex(meta.grid, place.lat, place.lon);
      if (i < 0) return;
      const { years, values } = cellSeries(s, i);
      setAnnual({ id: meta.id, years, values, res: analyzeAnnual(years, values) });
    });
    return () => {
      alive = false;
    };
  }, [meta, place.lat, place.lon]);

  // Live monthly detail from NASA POWER at the exact point.
  useEffect(() => {
    const params = [...new Set(metas.map((m) => info(m.id).powerParam).filter((p): p is string => !!p))].slice(0, 20);
    let alive = true;
    setLive({ status: "loading" });
    const end = Math.max(...metas.map((m) => m.years[1]));
    // The request is shared and cached, so it is never aborted; stale answers are ignored.
    fetchPowerPoint(place.lat, place.lon, params, 1981, end).then(
      (data) => alive && setLive({ status: "ready", data }),
      () => alive && setLive({ status: "error" }),
    );
    return () => {
      alive = false;
    };
  }, [metas, place.lat, place.lon]);

  const monthly: MonthlyAnalysis | null = useMemo(() => {
    if (live.status !== "ready" || !live.data || !vi.powerParam) return null;
    const raw = live.data.params[vi.powerParam];
    if (!raw?.length) return null;
    const k = vi.liveScale ?? 1;
    const pts = k === 1 ? raw : raw.map((p) => ({ ...p, value: p.value === null ? null : p.value * k }));
    return analyzeMonthly(pts, { stat: vi.stat });
  }, [live, vi.powerParam, vi.stat, vi.liveScale]);

  const monthlyAnoms = useMemo(() => {
    if (live.status !== "ready" || !live.data || !vi.powerParam) return null;
    const raw = live.data.params[vi.powerParam];
    if (!raw?.length || vi.stat === "sum") return null;
    const k = vi.liveScale ?? 1;
    const pts = k === 1 ? raw : raw.map((p) => ({ ...p, value: p.value === null ? null : p.value * k }));
    return deseasonalize(pts)
      .filter((p) => p.value !== null)
      .map((p) => ({ t: p.year + (p.month - 0.5) / 12, v: p.value as number }));
  }, [live, vi.powerParam, vi.stat, vi.liveScale]);

  const rows = useMemo(() => {
    const list = metas.map((m) => ({ meta: m, row: scan.get(m.id), loaded: scan.has(m.id) }));
    return list.sort((a, b) => {
      const ra = a.row;
      const rb = b.row;
      if (!a.loaded || !b.loaded) return a.loaded ? -1 : b.loaded ? 1 : 0;
      if (!ra || !rb) return ra ? -1 : rb ? 1 : 0;
      if (ra.sig !== rb.sig) return rb.sig - ra.sig;
      return ra.p - rb.p;
    });
  }, [metas, scan]);

  const sigCount = rows.filter((r) => r.row && r.row.sig >= 2).length;
  // Time window: the full record or a sub-period, re-tested on the fly.
  const windows = useMemo(() => {
    if (!annual || annual.id !== meta.id) return [];
    const first = annual.years[0];
    const last = annual.years[annual.years.length - 1];
    const list: { key: string; label: string; from: number; to: number }[] = [{ key: "all", label: "Full record", from: first, to: last }];
    if (first <= 1985 && last >= 2005) {
      list.push({ key: "early", label: `${first} to 2000`, from: first, to: 2000 });
      list.push({ key: "late", label: `2001 to ${last}`, from: 2001, to: last });
    }
    if (last - first + 1 > 24) list.push({ key: "recent", label: "Last 20 years", from: last - 19, to: last });
    return list;
  }, [annual, meta.id]);
  const win = windows.find((w) => w.key === windowKey) ?? windows[0];
  const view = useMemo(() => {
    if (!annual || annual.id !== meta.id || !win) return null;
    if (win.key === "all") return { years: annual.years, values: annual.values, res: annual.res };
    const idx = annual.years.map((y, i) => (y >= win.from && y <= win.to ? i : -1)).filter((i) => i >= 0);
    const years = idx.map((i) => annual.years[i]);
    const values = idx.map((i) => annual.values[i]);
    return { years, values, res: analyzeAnnual(years, values) };
  }, [annual, meta.id, win]);
  const res = view ? view.res : null;
  const mapRow = scan.get(meta.id);
  const pairId = PAIRS[meta.id];
  const pairMeta = pairId ? metas.find((m) => m.id === pairId) : undefined;
  const pairRow = pairId ? scan.get(pairId) : undefined;
  // Keep the trend colour bright enough to read on the panel even for small trends.
  const color = res && res.ok ? vividColor(vi.ramp, res.slopePerDecade / slopeScale(meta)) : "var(--ink)";

  const verdict = (() => {
    if (!res) return null;
    if (!res.ok) return { head: "Not enough data here", body: "This place has too few years of data for a trend test." };
    const dir = res.slopePerDecade > 0 ? vi.increaseWord : vi.decreaseWord;
    const head = res.significant ? `${cap(dir)}, ${res.confidence} evidence` : `No clear trend yet`;
    const total = Math.abs(res.totalChange);
    const body = res.significant
      ? `From ${res.firstYear} to ${res.lastYear}, ${vi.name.toLowerCase()} here changed by about ${fmt(total, vi.decimals)} ${vi.unitsLabel} (${res.slopePerDecade > 0 ? "up" : "down"}). If nothing were really changing, a pattern this steady would turn up by chance ${pWords(res.p)} times.`
      : `The data drift ${res.slopePerDecade >= 0 ? "up" : "down"} by ${fmt(Math.abs(res.slopePerDecade), vi.decimals)} ${vi.unitsLabel} per decade, but year-to-year swings are large enough that chance could explain it (${pEq(res.p)}).`;
    return { head, body };
  })();

  const downloadCsv = () => {
    if (!annual) return;
    const lines = [`# TrendScope export: ${vi.name} (${vi.unitsLabel}), ${vi.sourceLine}`, `# ${coord(place.lat, place.lon)}`, "year,value"];
    annual.years.forEach((y, i) => lines.push(`${y},${annual.values[i] ?? ""}`));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `trendscope_${meta.id}_${place.lat.toFixed(2)}_${place.lon.toFixed(2)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyLink = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("lat", place.lat.toFixed(3));
    url.searchParams.set("lon", place.lon.toFixed(3));
    url.searchParams.set("v", meta.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <aside className="inspector" aria-label="Investigation">
      <header className="insp-head">
        <div>
          <h2>{name ?? "Selected place"}</h2>
          <p className="num insp-coord">{coord(place.lat, place.lon)}</p>
        </div>
        <button className="icon-btn" type="button" aria-label="Close the investigation" onClick={onClose}>
          <X size={18} strokeWidth={1.75} />
        </button>
      </header>

      <div className="insp-body">
        <section className="insp-verdict" aria-live="polite">
          <div className="insp-var">
            <span className="insp-varname">{vi.name}</span>
            {meta.id !== globeVar && (
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => onShowOnGlobe(meta.id)}>
                <Globe2 size={14} strokeWidth={1.75} /> Show on globe
              </button>
            )}
          </div>
          {windows.length > 1 && (
            <div className="insp-windows" role="group" aria-label="Time window">
              {windows.map((w) => (
                <button key={w.key} type="button" aria-pressed={w.key === (win?.key ?? "all")} onClick={() => setWindowKey(w.key)}>
                  {w.label}
                </button>
              ))}
            </div>
          )}
          {res && res.ok ? (
            <>
              <p className="insp-big">
                {signed(res.slopePerDecade, vi.decimals)}
                <span> {vi.unitsLabel} per decade</span>
              </p>
              <div className="insp-gauge" style={{ background: rampCss(vi.ramp) }} aria-hidden>
                <i style={{ left: `${(Math.max(-1, Math.min(1, res.slopePerDecade / slopeScale(meta))) + 1) * 50}%` }} />
              </div>
              <h3 className="insp-head-line">{verdict?.head}</h3>
              <p className="insp-sentence">{verdict?.body}</p>
            </>
          ) : res && !res.ok ? (
            <>
              <h3 className="insp-head-line">{verdict?.head}</h3>
              <p className="insp-sentence">{verdict?.body}</p>
            </>
          ) : (
            <div className="sk-block" aria-label="Loading" />
          )}
        </section>

        {view && res && res.ok && (
          <section className="insp-section">
            <TrendChart
              years={view.years}
              values={view.values}
              sen={{ intercept: res.intercept, slopePerYear: res.slopePerYear, firstYear: res.firstYear, lastYear: res.lastYear, ciPerDecade: res.ciPerDecade }}
              changeYear={res.pettitt.significant ? res.pettitt.year : null}
              units={vi.unitsLabel}
              decimals={vi.decimals}
              color={color}
              label={`Annual ${vi.name.toLowerCase()} from ${res.firstYear} to ${res.lastYear} with the Sen trend line`}
              monthly={monthlyAnoms ?? undefined}
              monthlyOffset={res.mean}
            />
            <p className="insp-caption">
              Dots are yearly values. The line is the Sen trend with its 95% range{monthlyAnoms ? "; the faint trace is monthly data with the seasons removed" : ""}
              {res.pettitt.significant ? `. The dashed line marks the most likely shift, in ${res.pettitt.year}.` : "."}
            </p>
          </section>
        )}

        {res && res.ok && (
          <section className="insp-section">
            <h3 className="insp-h">The evidence</h3>
            <dl className="stats">
              <Stat label="Sen slope, 95% range" value={`${signed(res.ciPerDecade[0], vi.decimals)} to ${signed(res.ciPerDecade[1], vi.decimals)}`} />
              <Stat label="Mann-Kendall p" value={pValue(res.p)} hint={res.nStar > 1 ? "corrected for autocorrelation" : undefined} />
              <Stat label="Kendall tau" value={fmt(res.tau, 3)} />
              <Stat label="z score" value={fmt(res.z, 2)} />
              <Stat label="Years of data" value={`${res.n}`} />
              <Stat label="Year-to-year memory (r1)" value={fmt(res.r1, 2)} />
              <Stat label="Least squares slope" value={`${signed(res.ols.slopePerDecade, vi.decimals)} (R² ${fmt(res.ols.r2, 2)})`} />
              <Stat
                label="On the global map"
                value={mapRow ? (mapRow.sig >= 2 ? "passes FDR test" : mapRow.sig >= 1 ? "p < 0.05 only" : "not significant") : "–"}
              />
            </dl>
            {!res.significant && res.detection.year !== null && Number.isFinite(res.detection.years) && (
              <p className="insp-note">
                At this rate, with this much year-to-year noise, the trend would become clear after about{" "}
                <strong className="num">{Math.ceil(res.detection.years)}</strong> years of record, around{" "}
                <strong className="num">{res.detection.year}</strong>.
              </p>
            )}
            {res.significant && res.detection.withinRecord && (
              <p className="insp-note">
                The record is already long enough to detect a change of this size: about{" "}
                <strong className="num">{Math.ceil(res.detection.years)}</strong> years were needed and{" "}
                <strong className="num">{res.n}</strong> are available.
              </p>
            )}
          </section>
        )}

        {vi.powerParam && (
          <section className="insp-section">
            <h3 className="insp-h">Which months drive it</h3>
            {monthly && monthly.months.length === 12 ? (
              <>
                <SeasonBars
                  bars={monthly.months.map((m) => ({
                    month: m.month,
                    slopePerDecade: m.ok ? m.slopePerDecade : null,
                    significant: m.ok ? m.significant : false,
                  }))}
                  scale={slopeScale(meta) * (vi.stat === "sum" ? 1 / 12 : 1)}
                  ramp={vi.ramp}
                  units={vi.unitsLabel}
                  decimals={vi.decimals}
                />
                {monthly.seasonal.ok && (
                  <p className="insp-caption">
                    Seasonal Mann-Kendall test across all 12 months: {pEq(monthly.seasonal.p)}. Filled bars are months with a
                    significant trend on their own. Live monthly data from NASA POWER at this exact point.
                  </p>
                )}
              </>
            ) : live.status === "error" ? (
              <p className="insp-caption">NASA POWER did not answer just now. The yearly analysis above uses the bundled data, so it still holds.</p>
            ) : (
              <div className="sk-block sk-short" aria-label="Loading monthly data from NASA POWER" />
            )}
          </section>
        )}

        {pairMeta && pairRow !== undefined && (
          <section className="insp-section">
            <h3 className="insp-h">Second opinion</h3>
            {pairRow ? (
              <p className="insp-sentence">
                {info(pairId).name}, an independent NASA record built from{" "}
                {pairId === "gistemp" ? "weather stations and ship measurements" : pairId === "gpcp" ? "satellites and rain gauges" : "a global model fed by satellites"}, shows{" "}
                <strong className="num">
                  {signed(pairRow.slope, info(pairId).decimals)} {info(pairId).unitsLabel}
                </strong>{" "}
                per decade here ({pEq(pairRow.p)}).{" "}
                {res && res.ok && Math.sign(pairRow.slope) === Math.sign(res.slopePerDecade)
                  ? "Both records point the same way."
                  : "The two records disagree here, so treat this place with care."}
              </p>
            ) : (
              <p className="insp-caption">The independent record has no data at this point.</p>
            )}
          </section>
        )}

        <section className="insp-section">
          <h3 className="insp-h">
            What else is changing here
            <span className="insp-count num">
              {sigCount} of {metas.length} pass the FDR test
            </span>
          </h3>
          <ul className="scan">
            {rows.map(({ meta: m, row, loaded }) => {
              const v = info(m.id);
              const active = m.id === meta.id;
              if (!loaded) {
                return (
                  <li key={m.id} className="scan-row is-loading">
                    <span className="scan-name">{v.name}</span>
                    <span className="sk-pill" />
                  </li>
                );
              }
              const tone = row ? vividColor(v.ramp, row.slope / slopeScale(m)) : "var(--line-strong)";
              return (
                <li key={m.id}>
                  <button type="button" className="scan-row" aria-pressed={active} onClick={() => setFocusVar(m.id)}>
                    <span className="scan-dot" style={{ background: row && row.sig >= 1 ? tone : "transparent", borderColor: tone }} />
                    <span className="scan-name">{v.name}</span>
                    <span className="scan-val num">
                      {row ? `${signed(row.slope, v.decimals)} ${v.unitsLabel}` : "no data"}
                    </span>
                    <span className={`scan-pill ${row && row.sig >= 2 ? "is-strong" : row && row.sig >= 1 ? "is-weak" : ""}`}>
                      {row ? (row.sig >= 2 ? "Significant" : row.sig >= 1 ? "Possible" : "Not clear") : "–"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="insp-actions">
          <button className="btn btn-quiet btn-sm" type="button" onClick={downloadCsv} disabled={!annual}>
            <Download size={14} strokeWidth={1.75} /> Download data
          </button>
          <button className="btn btn-quiet btn-sm" type="button" onClick={copyLink}>
            <Link2 size={14} strokeWidth={1.75} /> {copied ? "Link copied" : "Copy link"}
          </button>
        </section>
        <p className="insp-source">
          Source: {vi.sourceLine}
          {meta.years ? `, ${meta.years[0]} to ${meta.years[1]}` : ""}. Annual values, Mann-Kendall test with an autocorrelation
          correction, Sen slope.
        </p>
      </div>
    </aside>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd className="num">
        {value}
        {hint && <small>{hint}</small>}
      </dd>
    </div>
  );
}

function vividColor(ramp: Parameters<typeof rampColor>[0], v: number) {
  const m = Math.max(0.62, Math.min(1, Math.abs(v)));
  return rampColor(ramp, (v < 0 ? -1 : 1) * m);
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
