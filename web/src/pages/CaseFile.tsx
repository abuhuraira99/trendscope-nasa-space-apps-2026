import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Compass } from "lucide-react";
import Globe, { type GlobeArc, type GlobeField, type GlobePin } from "../components/globe/Globe";
import TrendChart from "../components/charts/TrendChart";
import { CASE_BY_ID, CASES, fillPlaceholders, zoomToDistance, type CaseFile as CaseT } from "../content/cases";
import { useTrendGrid, useVarsFile } from "../lib/data/hooks";
import { cellIndex, cellSeries, loadSeries, type VarMeta } from "../lib/data/grids";
import { analyzeAnnual, type AnnualResult } from "../lib/stats";
import { info, slopeScaleFor } from "../lib/catalog";
import { rampColor, rampCss } from "../lib/color/ramps";
import { pValue, signed } from "../lib/format";
import { angularDistance } from "../components/globe/geo";
import "./casefile.css";

interface PointResult {
  years: number[];
  values: (number | null)[];
  res: AnnualResult;
}

async function analyzeAt(meta: VarMeta, lat: number, lon: number): Promise<PointResult | null> {
  const s = await loadSeries(meta);
  const i = cellIndex(meta.grid, lat, lon);
  if (i < 0) return null;
  const { years, values } = cellSeries(s, i);
  return { years, values, res: analyzeAnnual(years, values) };
}

const slopeScale = slopeScaleFor;

function words(varId: string, r: AnnualResult | undefined) {
  const v = info(varId);
  if (!r || !r.ok) return { verdict: "not enough data", slope: "n/a", p: "n/a" };
  const verdict = r.significant ? `a significant trend toward ${r.slopePerDecade > 0 ? v.increaseWord : v.decreaseWord}` : "no clear trend";
  const unit = v.unitsLabel ? ` ${v.unitsLabel}` : "";
  return {
    verdict,
    slope: `${signed(r.slopePerDecade, v.decimals)}${unit}`,
    ciLow: `${signed(r.ciPerDecade[0], v.decimals)}${unit}`,
    ciHigh: `${signed(r.ciPerDecade[1], v.decimals)}${unit}`,
    p: r.p < 0.001 ? "< 0.001" : `= ${pValue(r.p)}`,
    years: r.n,
    firstYear: r.firstYear,
    lastYear: r.lastYear,
    changeYear: r.pettitt.year ?? "n/a",
    pettittP: pValue(r.pettitt.p),
    detectYears: Number.isFinite(r.detection.years) ? Math.round(r.detection.years) : "n/a",
  };
}

export default function CaseFile() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const kase: CaseT | undefined = CASE_BY_ID[id];
  const vars = useVarsFile();
  const [step, setStep] = useState(0);
  const [results, setResults] = useState<Record<string, PointResult | null>>({});
  const [view, setView] = useState({ lat: kase?.lat ?? 20, lon: kase?.lon ?? 0, distance: 3.6 });
  const [nonce, setNonce] = useState(0);

  const metas = vars.status === "ready" ? vars.data.vars : [];
  const s = kase?.steps[Math.min(step, (kase?.steps.length ?? 1) - 1)];
  const focusMeta = metas.find((m) => m.id === s?.focus.variable);
  const trend = useTrendGrid(focusMeta);
  const atEnd = kase ? step >= kase.steps.length : false;

  useEffect(() => {
    setStep(0);
    setResults({});
  }, [id]);

  // Fly to each step.
  useEffect(() => {
    if (!kase) return;
    const f = atEnd ? { lat: kase.lat, lon: kase.lon, zoom: 3 } : s?.focus;
    if (!f) return;
    setView({ lat: f.lat, lon: f.lon, distance: zoomToDistance(f.zoom) });
    setNonce((n) => n + 1);
  }, [kase, s, atEnd]);

  // Compute the analyses the current step needs: focus point, main point, compare point.
  useEffect(() => {
    if (!kase || !s || !focusMeta) return;
    const jobs: [string, number, number][] = [
      [`${focusMeta.id}|focus|${step}`, s.focus.lat, s.focus.lon],
      [`${focusMeta.id}|main`, kase.lat, kase.lon],
    ];
    if (kase.compareWith) jobs.push([`${focusMeta.id}|compare`, kase.compareWith.lat, kase.compareWith.lon]);
    let alive = true;
    for (const [k, lat, lon] of jobs) {
      if (k in results) continue;
      analyzeAt(focusMeta, lat, lon)
        .then((r) => alive && setResults((prev) => ({ ...prev, [k]: r })))
        .catch(() => alive && setResults((prev) => ({ ...prev, [k]: null })));
    }
    return () => {
      alive = false;
    };
  }, [kase, s, focusMeta, step, results]);

  // Takeaway uses the headline variable at the main point.
  const headMeta = kase ? metas.find((m) => m.id === kase.variables[0]) : undefined;
  useEffect(() => {
    if (!atEnd || !headMeta || !kase) return;
    const k = `${headMeta.id}|main`;
    if (k in results) return;
    analyzeAt(headMeta, kase.lat, kase.lon).then((r) => setResults((prev) => ({ ...prev, [k]: r })));
  }, [atEnd, headMeta, kase, results]);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!kase) return;
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") setStep((x) => Math.min(kase.steps.length, x + 1));
      if (e.key === "ArrowLeft") setStep((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kase]);

  const field: GlobeField | null = useMemo(() => {
    if (!focusMeta || trend.status !== "ready") return null;
    const r = results[`${focusMeta.id}|focus|${step}`]?.res;
    const base = slopeScale(focusMeta);
    const scale = r && r.ok ? Math.max(base, Math.abs(r.slopePerDecade) * 1.15) : base;
    return { key: `${focusMeta.id}|s${scale.toFixed(3)}`, geom: focusMeta.grid, values: trend.data.slope, sig: trend.data.sig, scale, ramp: info(focusMeta.id).ramp };
  }, [focusMeta, trend, results, step]);

  if (!kase) {
    return (
      <main id="main" className="page">
        <div className="page-wrap">
          <h1>Case file not found</h1>
          <p style={{ marginTop: 16 }}>
            <Link to="/cases">See all case files</Link>
          </p>
        </div>
      </main>
    );
  }

  const focusKey = focusMeta ? `${focusMeta.id}|focus|${step}` : "";
  const focusRes = results[focusKey];
  const mainRes = focusMeta ? results[`${focusMeta.id}|main`] : undefined;
  const cmpRes = focusMeta ? results[`${focusMeta.id}|compare`] : undefined;
  const nearCompare =
    kase.compareWith && s ? angularDistance(s.focus.lat, s.focus.lon, kase.compareWith.lat, kase.compareWith.lon) < 1.5 : false;
  const nearMain = s ? angularDistance(s.focus.lat, s.focus.lon, kase.lat, kase.lon) < 1.5 : false;

  const values = (() => {
    if (!focusMeta) return {};
    const w = words(focusMeta.id, focusRes?.res);
    const m = words(focusMeta.id, mainRes?.res);
    const c = words(focusMeta.id, cmpRes?.res);
    return {
      ...w,
      place: nearCompare ? kase.compareWith?.place : nearMain ? kase.place : "this point",
      variable: info(focusMeta.id).name.toLowerCase(),
      mainVerdict: m.verdict,
      mainSlope: m.slope,
      mainChangeYear: m.changeYear,
      compareVerdict: c.verdict,
      compareSlope: c.slope,
      compareP: c.p,
      comparePlace: kase.compareWith?.place,
    };
  })();

  const pins: GlobePin[] = [{ id: "main", lat: kase.lat, lon: kase.lon }];
  if (kase.compareWith) pins.push({ id: "cmp", lat: kase.compareWith.lat, lon: kase.compareWith.lon, tone: "secondary" });
  const arcs: GlobeArc[] =
    kase.compareWith && (nearCompare || atEnd) ? [{ from: { lat: kase.lat, lon: kase.lon }, to: kase.compareWith }] : [];

  const fi = focusMeta ? info(focusMeta.id) : null;
  const chartColor =
    focusRes && focusRes.res.ok && focusMeta && fi
      ? rampColor(fi.ramp, Math.sign(focusRes.res.slopePerDecade || 1) * Math.max(0.62, Math.min(1, Math.abs(focusRes.res.slopePerDecade) / slopeScale(focusMeta))))
      : "var(--ink)";

  const headWords = headMeta ? words(headMeta.id, results[`${headMeta.id}|main`]?.res) : null;
  const idx = CASES.findIndex((c) => c.id === kase.id);
  const nextCase = CASES[(idx + 1) % CASES.length];

  return (
    <div className="casefile">
      <aside className="cf-story">
        <Link to="/cases" className="cf-back">
          <ArrowLeft size={16} strokeWidth={1.75} /> All case files
        </Link>
        <h1>{kase.title}</h1>
        <p className="cf-question">{kase.question}</p>

        <p className="cf-progress-label">
          <span>{atEnd ? "Verdict" : fi?.name}</span>
          <span className="num">{atEnd ? `${kase.steps.length} steps` : `${step + 1} / ${kase.steps.length}`}</span>
        </p>
        <div className="cf-progress" role="tablist" aria-label="Steps">
          {kase.steps.map((st, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={`Step ${i + 1}: ${st.title}`}
              className={i < step ? "done" : ""}
              onClick={() => setStep(i)}
            />
          ))}
          <button type="button" role="tab" aria-selected={atEnd} aria-label="Conclusion" className="cf-end" onClick={() => setStep(kase.steps.length)} />
        </div>

        {!atEnd && s && fi ? (
          <article className="cf-step" key={step} aria-live="polite">
            <h2>{s.title}</h2>
            <p className="cf-body">{fillPlaceholders(s.body, values)}</p>
            {focusRes && focusRes.res.ok ? (
              <div className="cf-chart">
                <TrendChart
                  years={focusRes.years}
                  values={focusRes.values}
                  sen={{
                    intercept: focusRes.res.intercept,
                    slopePerYear: focusRes.res.slopePerYear,
                    firstYear: focusRes.res.firstYear,
                    lastYear: focusRes.res.lastYear,
                    ciPerDecade: focusRes.res.ciPerDecade,
                  }}
                  changeYear={focusRes.res.pettitt.significant ? focusRes.res.pettitt.year : null}
                  units={fi.unitsLabel}
                  decimals={fi.decimals}
                  color={chartColor}
                  height={180}
                  label={`Yearly ${fi.name.toLowerCase()} at this step's location`}
                />
              </div>
            ) : (
              <div className="sk-block" style={{ height: 180, marginTop: 18 }} />
            )}
          </article>
        ) : (
          <article className="cf-step cf-final" aria-live="polite">
            <h2>{headWords ? fillPlaceholders(kase.takeaway, { ...headWords, place: kase.place, variable: info(kase.variables[0]).name.toLowerCase() }) : "…"}</h2>
            <h3>Sources</h3>
            <ul className="cf-sources">
              {kase.sources.map((src) => (
                <li key={src.url}>
                  <a href={src.url} target="_blank" rel="noreferrer">
                    {src.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="cf-final-actions">
              <button
                className="btn btn-quiet"
                type="button"
                onClick={() => navigate(`/?lat=${kase.lat}&lon=${kase.lon}&v=${kase.variables[0]}`)}
              >
                <Compass size={16} strokeWidth={1.75} /> Investigate this place yourself
              </button>
              <Link className="btn btn-primary" to={`/cases/${nextCase.id}`}>
                Next case: {nextCase.title}
              </Link>
            </div>
          </article>
        )}

        <nav className="cf-nav" aria-label="Step navigation">
          <button className="btn btn-quiet" type="button" disabled={step === 0} onClick={() => setStep((x) => Math.max(0, x - 1))}>
            <ArrowLeft size={16} strokeWidth={1.75} /> Back
          </button>
          {!atEnd && (
            <button className="btn btn-primary" type="button" onClick={() => setStep((x) => x + 1)}>
              {step === kase.steps.length - 1 ? "See the verdict" : "Next step"} <ArrowRight size={16} strokeWidth={1.75} />
            </button>
          )}
        </nav>
      </aside>

      <main className="cf-stage" id="main">
        <Globe className="cf-globe" field={field} view={view} viewNonce={nonce} pins={pins} arcs={arcs} label={`Globe showing ${fi?.name ?? "the data"} for this case`} />
        {fi && focusMeta && (
          <div className="cf-legend">
            <strong>{fi.name}</strong>
            <span>
              trend per decade{fi.unitsLabel ? ` (${fi.unitsLabel})` : ""}, {focusMeta.years[0]} to {focusMeta.years[1]}
            </span>
            <span className="cf-legend-bar" style={{ background: rampCss(fi.ramp) }} aria-hidden />
            <span className="cf-legend-ticks num">
              <span>{signed(-(field?.scale ?? slopeScale(focusMeta)), fi.decimals)}</span>
              <span>0</span>
              <span>{signed(field?.scale ?? slopeScale(focusMeta), fi.decimals)}</span>
            </span>
            {kase.compareWith && (
              <span className="cf-pins">
                <i className="cf-pin" /> {kase.place.split(",")[0]} <i className="cf-pin cf-pin-2" /> {kase.compareWith.place.split(",")[0]}
              </span>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
