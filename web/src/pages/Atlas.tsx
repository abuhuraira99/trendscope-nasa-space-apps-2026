import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, LocateFixed, Pause, Play, Split, X } from "lucide-react";
import { Link } from "react-router-dom";
import Detective from "../components/detective/Detective";
import Globe, { type GlobeArc, type GlobeField, type GlobePin } from "../components/globe/Globe";
import { useAtlas } from "../state/store";
import { useSeriesGrid, useTrendGrid, useVarsFile } from "../lib/data/hooks";
import { cellIndex, type VarMeta } from "../lib/data/grids";
import { info, SPHERES, slopeScaleFor } from "../lib/catalog";
import { rampCss } from "../lib/color/ramps";
import { coord, fmt, pct, signed } from "../lib/format";
import Inspector from "../components/inspector/Inspector";
import SearchBox from "../components/SearchBox";
import { askQuestion } from "../lib/ask";
import { searchPlaces } from "../lib/geocode";
import "./atlas.css";
import "./atlas-extra.css";

const slopeScale = slopeScaleFor;

export default function Atlas() {
  const vars = useVarsFile();
  const { varId, setVar, sigOnly, setSigOnly, place, pick, view, viewNonce, flyTo, mode, setMode, year, setYear, playing, setPlaying } =
    useAtlas();
  const metas = vars.status === "ready" ? vars.data.vars : [];
  const meta = metas.find((m) => m.id === varId) ?? metas[0];
  const vi = info(meta?.id ?? varId);
  const trend = useTrendGrid(meta);
  const series = useSeriesGrid(meta, mode === "year");
  const searchRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState<{ lat: number; lon: number } | null>(null);
  const [tab, setTab] = useState<"explore" | "detective">("explore");
  const [askNote, setAskNote] = useState<{ text: string; busy: boolean } | null>(null);
  const setFocusVar = useAtlas((s) => s.setFocusVar);

  const onAsk = async (question: string) => {
    setAskNote({ text: "Reading your question", busy: true });
    const r = await askQuestion(
      question,
      metas.map((m) => ({ id: m.id, name: info(m.id).name })),
    );
    const v = r.variables.find((id) => metas.some((m) => m.id === id)) ?? varId;
    const hits = r.place ? await searchPlaces(r.place).catch(() => []) : [];
    const hit = hits[0];
    if (!hit) {
      setAskNote({ text: "I could not find a place in that question. Try adding a city or a country.", busy: false });
      return;
    }
    setVar(v);
    setFocusVar(v);
    pick({ lat: hit.lat, lon: hit.lon, name: [hit.name, hit.detail].filter(Boolean).join(", ") });
    flyTo(hit.lat, hit.lon, 2.7);
    setAskNote({
      text: `${info(v).name} in ${hit.name}${r.via === "model" ? ". Question read by an AI model; every number comes from the NASA data." : "."}`,
      busy: false,
    });
    window.setTimeout(() => setAskNote(null), 9000);
  };
  const [twins, setTwins] = useState(false);

  // Keep the selected variable valid once the catalogue loads.
  useEffect(() => {
    if (metas.length && !metas.some((m) => m.id === varId)) setVar(metas[0].id);
  }, [metas, varId, setVar]);

  // Year-by-year anomaly fields relative to the first 30 years.
  const anomalies = useMemo(() => {
    if (mode !== "year" || series.status !== "ready" || !meta) return null;
    const s = series.data;
    const Y = s.years.length;
    const n = meta.grid.nlat * meta.grid.nlon;
    const base = new Float32Array(n);
    const nb = Math.min(30, Y);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let k = 0;
      for (let y = 0; y < nb; y++) {
        const v = s.data[i * Y + y];
        if (v !== -32768) {
          sum += v;
          k++;
        }
      }
      base[i] = k ? (sum / k) * meta.seriesScale + meta.seriesOffset : NaN;
    }
    return { base, Y, years: s.years, data: s.data };
  }, [mode, series, meta]);

  const yearIdx = anomalies && year !== null ? anomalies.years.indexOf(year) : -1;

  const field: GlobeField | null = useMemo(() => {
    if (!meta || trend.status !== "ready") return null;
    if (mode === "year" && anomalies && yearIdx >= 0) {
      const n = meta.grid.nlat * meta.grid.nlon;
      const vals = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const raw = anomalies.data[i * anomalies.Y + yearIdx];
        vals[i] = raw === -32768 ? NaN : raw * meta.seriesScale + meta.seriesOffset - anomalies.base[i];
      }
      const decadeScale = slopeScale(meta) * Math.max(1.5, (anomalies.years.length / 10) * 0.6);
      return { key: `${meta.id}|year${year}`, geom: meta.grid, values: vals, scale: decadeScale, ramp: info(meta.id).ramp };
    }
    return { key: meta.id, geom: meta.grid, values: trend.data.slope, sig: trend.data.sig, scale: slopeScale(meta), ramp: info(meta.id).ramp };
  }, [meta, trend, mode, anomalies, yearIdx, year]);

  // Time-lapse playback
  useEffect(() => {
    if (!playing || !anomalies) return;
    const t = window.setInterval(() => {
      const ys = anomalies.years;
      const cur = useAtlas.getState().year ?? ys[0];
      const i = ys.indexOf(cur);
      if (i >= ys.length - 1) {
        setPlaying(false);
        return;
      }
      setYear(ys[i + 1]);
    }, 420);
    return () => window.clearInterval(t);
  }, [playing, anomalies, setYear, setPlaying]);

  useEffect(() => {
    if (mode === "year" && anomalies && (year === null || !anomalies.years.includes(year))) {
      setYear(anomalies.years[anomalies.years.length - 1]);
    }
  }, [mode, anomalies, year, setYear]);

  const bestPair = useMemo(() => (meta && !info(meta.id).noTwins ? pickTwins(meta) : null), [meta]);
  const twinPair = twins ? bestPair : null;
  const pins: GlobePin[] = place ? [{ id: "place", lat: place.lat, lon: place.lon }] : [];
  if (twinPair) {
    pins.push({ id: "twin-up", lat: twinPair.up.lat, lon: twinPair.up.lon });
    pins.push({ id: "twin-down", lat: twinPair.down.lat, lon: twinPair.down.lon, tone: "secondary" });
  }
  const arcs: GlobeArc[] = twinPair ? [{ from: twinPair.up, to: twinPair.down }] : [];

  const hoverReadout = useMemo(() => {
    if (!hover || !meta || trend.status !== "ready") return null;
    const i = cellIndex(meta.grid, hover.lat, hover.lon);
    if (i < 0) return null;
    const s = trend.data.slope[i];
    return { ...hover, slope: s, p: trend.data.p[i], sig: trend.data.sig[i] };
  }, [hover, meta, trend]);

  const onPick = (lat: number, lon: number) => {
    pick({ lat, lon });
  };

  const inspectorOpen = !!place;

  return (
    <div className={`atlas ${inspectorOpen ? "has-inspector" : ""}`}>
      <aside className="rail" aria-label="Variables">
        <div className="rail-intro">
          <h1>See where Earth is changing, and prove it.</h1>
          <p className="rail-fact">
            {vars.status === "ready" ? `${vars.data.period[1] - vars.data.period[0] + 1} years` : "Decades"} of NASA satellite and model
            data, tested for real trends at every place on the planet.
          </p>
          <p className="rail-more">
            New here? Try <Link to="/cases/lahore-humid-heat">a guided case file</Link> or switch to detective mode below.
          </p>
        </div>

        <div className="rail-tabs" role="tablist" aria-label="Mode">
          <button type="button" role="tab" aria-selected={tab === "explore"} onClick={() => setTab("explore")}>
            Explore the maps
          </button>
          <button type="button" role="tab" aria-selected={tab === "detective"} onClick={() => setTab("detective")}>
            Detective mode
          </button>
        </div>

        {tab === "detective" ? (
          <div className="var-list">
            <Detective metas={metas} onDone={() => setTab("explore")} />
          </div>
        ) : (
        <nav className="var-list" aria-label="Choose what the globe shows">
          {SPHERES.map((sp) => {
            const items = metas.filter((m) => info(m.id).sphere === sp.id);
            if (!items.length) return null;
            return (
              <section key={sp.id} className="var-group">
                <h2>{sp.label}</h2>
                <ul>
                  {items.map((m) => {
                    const v = info(m.id);
                    const up = m.summary.validCells ? m.summary.fdrUp / m.summary.validCells : 0;
                    const down = m.summary.validCells ? m.summary.fdrDown / m.summary.validCells : 0;
                    const dominantUp = up >= down;
                    const share = dominantUp ? up : down;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          className="var-row"
                          aria-pressed={m.id === meta?.id}
                          onClick={() => setVar(m.id)}
                        >
                          <span className="var-swatch" style={{ background: rampCss(v.ramp) }} aria-hidden />
                          <span className="var-name" title={v.name}>
                            {v.name}
                          </span>
                          <span className="var-stat">
                            <span className="num">{pct(share)}</span> {dominantUp ? v.increaseWord : v.decreaseWord}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {vars.status === "loading" && <RailSkeleton />}
          {vars.status === "error" && <p className="rail-error">The trend maps could not load. Reload the page to try again.</p>}
        </nav>
        )}

        <label className="sig-toggle">
          <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} />
          <span className="sig-switch" aria-hidden />
          <span>
            Only show trends that pass the false discovery test
            <small>Hides places where the change could be chance across 50,000 tests</small>
          </span>
        </label>
      </aside>

      <main className="stage" id="main">
        <div className="stage-search">
          <SearchBox
            inputRef={searchRef}
            onAsk={onAsk}
            placeholder="Search a place, or ask: is Lahore getting more humid?"
            onSelect={(h) => {
              pick({ lat: h.lat, lon: h.lon, name: [h.name, h.detail].filter(Boolean).join(", ") });
              flyTo(h.lat, h.lon, 2.7);
            }}
          />
        </div>

        {askNote && (
          <p className={`ask-note ${askNote.busy ? "is-busy" : ""}`} role="status">
            {askNote.text}
          </p>
        )}

        <Globe
          className="stage-globe"
          field={field}
          sigOnly={sigOnly && mode === "trend"}
          view={view}
          viewNonce={viewNonce}
          pins={pins}
          arcs={arcs}
          idleSpin={!place && !twins}
          onPick={onPick}
          onHover={setHover}
        />

        <div className="stage-tools" role="group" aria-label="Globe controls">
          <button className="icon-btn" type="button" aria-label="Zoom in" onClick={() => flyTo(view.lat, view.lon, Math.max(1.6, view.distance * 0.75))}>
            <Plus size={18} strokeWidth={1.75} />
          </button>
          <button className="icon-btn" type="button" aria-label="Zoom out" onClick={() => flyTo(view.lat, view.lon, Math.min(6, view.distance / 0.75))}>
            <Minus size={18} strokeWidth={1.75} />
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Centre on the selected place"
            disabled={!place}
            onClick={() => place && flyTo(place.lat, place.lon, 2.2)}
          >
            <LocateFixed size={18} strokeWidth={1.75} />
          </button>
        </div>

        {meta && (
          <div className="legend" aria-label="Map legend">
            <div className="legend-title">
              <strong>{vi.name}</strong>
              <span>
                {mode === "trend"
                  ? `Trend per decade, ${meta.years[0]} to ${meta.years[1]}`
                  : `Difference from the ${meta.years[0]} to ${Math.min(meta.years[1], meta.years[0] + 29)} average`}
              </span>
            </div>
            <div className="legend-bar" style={{ background: rampCss(vi.ramp) }} />
            <div className="legend-ticks num">
              <span>{signed(-(field?.scale ?? slopeScale(meta)), vi.decimals)}</span>
              <span>0</span>
              <span>
                {signed(field?.scale ?? slopeScale(meta), vi.decimals)} {vi.unitsLabel}
              </span>
            </div>
            <div className="legend-words">
              <span>{vi.decreaseWord}</span>
              <span>{vi.increaseWord}</span>
            </div>
            {mode === "trend" && bestPair && (
              <button
                type="button"
                className="legend-twins"
                aria-pressed={twins}
                onClick={() => {
                  const next = !twins;
                  setTwins(next);
                  if (next && bestPair) {
                    const u = bestPair.up;
                    const d = bestPair.down;
                    flyTo((u.lat + d.lat) / 2, midLon(u.lon, d.lon), angular(u, d) > 70 ? 5.2 : 4.4);
                  }
                }}
              >
                <Split size={14} strokeWidth={1.75} /> {twins ? "Hide opposite fates" : "Show opposite fates"}
              </button>
            )}
            {mode === "trend" && (
              <div className="legend-sig">
                <span className="sig-key sig-key-solid" /> passes false discovery test
                <span className="sig-key sig-key-faint" /> could be chance
              </div>
            )}
          </div>
        )}

        {meta && !place && (
          <div className="ruler" role="group" aria-label="Time">
            <div className="ruler-modes" role="tablist">
              <button role="tab" aria-selected={mode === "trend"} className="ruler-mode" type="button" onClick={() => setMode("trend")}>
                Trend
              </button>
              <button role="tab" aria-selected={mode === "year"} className="ruler-mode" type="button" onClick={() => setMode("year")}>
                Year by year
              </button>
            </div>
            {mode === "year" ? (
              <div className="ruler-scrub">
                <button
                  className="icon-btn"
                  type="button"
                  aria-label={playing ? "Pause" : "Play the years"}
                  disabled={!anomalies}
                  onClick={() => {
                    if (!anomalies) return;
                    if (!playing && year === anomalies.years[anomalies.years.length - 1]) setYear(anomalies.years[0]);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? <Pause size={16} strokeWidth={1.75} /> : <Play size={16} strokeWidth={1.75} />}
                </button>
                <input
                  type="range"
                  min={meta.years[0]}
                  max={meta.years[1]}
                  step={1}
                  value={year ?? meta.years[1]}
                  aria-label="Year"
                  onChange={(e) => {
                    setPlaying(false);
                    setYear(Number(e.target.value));
                  }}
                  disabled={!anomalies}
                />
                <span className="ruler-year num">{anomalies ? year : "Loading"}</span>
              </div>
            ) : (
              <div className="ruler-span num">
                <span>{meta.years[0]}</span>
                <span className="ruler-line" aria-hidden />
                <span>{meta.years[1]}</span>
              </div>
            )}
          </div>
        )}

        {hoverReadout && !place && (
          <div className="readout num" aria-hidden>
            <span>{coord(hoverReadout.lat, hoverReadout.lon)}</span>
            {Number.isFinite(hoverReadout.slope) && (
              <span>
                {signed(hoverReadout.slope, vi.decimals)} {vi.unitsLabel}/decade · p {fmt(hoverReadout.p, 3)}
              </span>
            )}
          </div>
        )}

        {!place && !twinPair && <p className="stage-hint">Click anywhere on Earth to investigate it</p>}

        {twinPair && meta && (
          <div className="twins" role="region" aria-label="Opposite fates">
            <div className="twins-head">
              <strong>Same planet, opposite fates</strong>
              <button className="icon-btn" type="button" aria-label="Close" onClick={() => setTwins(false)}>
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>
            <p>
              The strongest significant trends in {vi.name.toLowerCase()} point in opposite directions{" "}
              {Math.round(angular(twinPair.up, twinPair.down))}° apart. The same warming planet can push one place up and another down.
            </p>
            {[
              { e: twinPair.up, word: vi.increaseWord },
              { e: twinPair.down, word: vi.decreaseWord },
            ].map(({ e, word }) => (
              <button
                key={`${e.lat},${e.lon}`}
                type="button"
                className="twin-row"
                onClick={() => {
                  setTwins(false);
                  pick({ lat: e.lat, lon: e.lon });
                  flyTo(e.lat, e.lon, 2.7);
                }}
              >
                <span className="num">{coord(e.lat, e.lon)}</span>
                <span>
                  <strong className="num">
                    {signed(e.slope, vi.decimals)} {vi.unitsLabel}
                  </strong>{" "}
                  per decade, {word}
                </span>
              </button>
            ))}
          </div>
        )}
      </main>

      {place && meta && (
        <Inspector
          place={place}
          metas={metas}
          globeVar={meta.id}
          onClose={() => pick(null)}
          onShowOnGlobe={(id) => setVar(id)}
        />
      )}
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="rail-skeleton" aria-hidden>
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="sk-row" />
      ))}
    </div>
  );
}

function midLon(a: number, b: number) {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return a + d / 2;
}

function angular(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = Math.PI / 180;
  const c = Math.sin(a.lat * r) * Math.sin(b.lat * r) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.cos((a.lon - b.lon) * r);
  return Math.acos(Math.max(-1, Math.min(1, c))) / r;
}

/** The pair of opposite significant extremes with the strongest combined contrast, at least 40 degrees apart. */
function pickTwins(m: VarMeta) {
  const ups = m.extremes?.up ?? [];
  const downs = m.extremes?.down ?? [];
  let best: { up: (typeof ups)[number]; down: (typeof downs)[number]; score: number } | null = null;
  for (const u of ups) {
    for (const d of downs) {
      if (angular(u, d) < 40) continue;
      const score = Math.abs(u.slope) + Math.abs(d.slope);
      if (!best || score > best.score) best = { up: u, down: d, score };
    }
  }
  return best ? { up: best.up, down: best.down } : null;
}
