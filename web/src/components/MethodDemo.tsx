import { useEffect, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { Shuffle, RotateCcw } from "lucide-react";
import { loadSeries, loadVars, cellIndex, cellSeries } from "../lib/data/grids";
import { analyzeAnnual, mkScore } from "../lib/stats";
import { fmt, pValue, signed } from "../lib/format";
import TrendChart from "./charts/TrendChart";
import { useElementWidth } from "./charts/useElementWidth";
import "./methodDemo.css";

const LAT = 31.52;
const LON = 74.36;
const RUNS = 600;

function shuffled(a: number[]): number[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export default function MethodDemo() {
  const [series, setSeries] = useState<{ years: number[]; values: number[] } | null>(null);
  const [scores, setScores] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    loadVars()
      .then((v) => {
        const m = v.vars.find((x) => x.id === "t2mwet");
        if (!m) throw new Error("no t2mwet");
        return loadSeries(m).then((s) => ({ s, m }));
      })
      .then(({ s, m }) => {
        if (!alive) return;
        const { years, values } = cellSeries(s, cellIndex(m.grid, LAT, LON));
        const ys: number[] = [];
        const vs: number[] = [];
        years.forEach((y, i) => {
          const v = values[i];
          if (v !== null) {
            ys.push(y);
            vs.push(v);
          }
        });
        setSeries({ years: ys, values: vs });
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, []);

  const res = useMemo(() => (series ? analyzeAnnual(series.years, series.values) : null), [series]);
  const S = useMemo(() => (series ? mkScore(series.values) : 0), [series]);
  const pairs = series ? (series.values.length * (series.values.length - 1)) / 2 : 0;
  const up = (pairs + S) / 2;
  const down = pairs - up;

  const run = () => {
    if (!series || running) return;
    setScores([]);
    setRunning(true);
    let done = 0;
    timer.current = window.setInterval(() => {
      const batch: number[] = [];
      for (let k = 0; k < 24 && done < RUNS; k++, done++) batch.push(mkScore(shuffled(series.values)));
      setScores((prev) => prev.concat(batch));
      if (done >= RUNS) {
        if (timer.current) window.clearInterval(timer.current);
        setRunning(false);
      }
    }, 40);
  };

  const beat = scores.filter((s) => Math.abs(s) >= Math.abs(S)).length;

  return (
    <div className="mdemo">
      <div className="mdemo-chart">
        {series && res && res.ok ? (
          <TrendChart
            years={series.years}
            values={series.values}
            sen={{ intercept: res.intercept, slopePerYear: res.slopePerYear, firstYear: res.firstYear, lastYear: res.lastYear, ciPerDecade: res.ciPerDecade }}
            units="°C"
            decimals={2}
            color="#e0805f"
            height={240}
            label="Yearly wet-bulb temperature in Lahore with its Sen trend line"
          />
        ) : (
          <div className="sk-block" style={{ height: 240 }} />
        )}
        <ol className="mdemo-steps">
          <li>
            <strong>Compare every pair of years.</strong> Of {pairs.toLocaleString("en-US")} pairs, the later year is higher in{" "}
            <span className="num">{up.toLocaleString("en-US")}</span> and lower in <span className="num">{down.toLocaleString("en-US")}</span>.
          </li>
          <li>
            <strong>Score the difference.</strong> Ups minus downs gives the Mann-Kendall score S = <span className="num">{S}</span>.
          </li>
          <li>
            <strong>Measure the size.</strong> The median slope of all pairs, the Sen slope, is{" "}
            <span className="num">{res && res.ok ? `${signed(res.slopePerDecade, 2)} °C` : "–"}</span> per decade.
          </li>
        </ol>
      </div>

      <div className="mdemo-test">
        <h3>Could chance do this?</h3>
        <p>
          Shuffle the same yearly values into a random order, so any real trend is destroyed, and score them again. Repeat{" "}
          {RUNS} times and see how often chance reaches a score as extreme as {S}.
        </p>
        <Histogram scores={scores} actual={S} maxAbs={pairs} />
        <div className="mdemo-actions">
          <button className="btn btn-primary" type="button" onClick={run} disabled={!series || running}>
            {scores.length ? <RotateCcw size={16} strokeWidth={1.75} /> : <Shuffle size={16} strokeWidth={1.75} />}
            {scores.length ? "Shuffle again" : `Shuffle ${RUNS} times`}
          </button>
          <span className="mdemo-count num" aria-live="polite">
            {scores.length > 0 && `${scores.length} shuffles, ${beat} as extreme`}
          </span>
        </div>
        {scores.length === RUNS && res && res.ok && (
          <p className="mdemo-result">
            {beat === 0
              ? `Not one of ${RUNS} shuffles came close. That is what a tiny p-value means: the test puts it at ${pValue(res.p)}.`
              : `${beat} of ${RUNS} shuffles were as extreme, about ${fmt((beat / RUNS) * 100, 1)}%. The formal test gives p = ${pValue(res.p)}.`}
          </p>
        )}
      </div>
    </div>
  );
}

function Histogram({ scores, actual, maxAbs }: { scores: number[]; actual: number; maxAbs: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref, 420);
  const height = 150;
  const lim = Math.max(Math.abs(actual) * 1.15, ...scores.map((s) => Math.abs(s)), maxAbs * 0.2);
  const bins = 41;
  const counts = new Array(bins).fill(0);
  for (const s of scores) {
    const b = Math.min(bins - 1, Math.max(0, Math.floor(((s + lim) / (2 * lim)) * bins)));
    counts[b]++;
  }
  const maxC = Math.max(4, ...counts);
  const x = scaleLinear().domain([-lim, lim]).range([8, width - 8]);
  const y = scaleLinear().domain([0, maxC]).range([height - 22, 6]);
  const bw = (width - 16) / bins;
  return (
    <div ref={ref} className="mdemo-hist">
      <svg width={width} height={height} role="img" aria-label={`Scores from ${scores.length} random shuffles compared with the real score ${actual}`}>
        <line x1={8} x2={width - 8} y1={height - 22} y2={height - 22} className="mdemo-axis" />
        {counts.map((c, i) =>
          c ? <rect key={i} x={8 + i * bw + 1} y={y(c)} width={Math.max(1, bw - 2)} height={height - 22 - y(c)} className="mdemo-bar" rx={1} /> : null,
        )}
        <g transform={`translate(${x(actual)},0)`}>
          <line y1={6} y2={height - 22} className="mdemo-actual" />
          <text y={height - 6} textAnchor="middle" className="mdemo-actual-label">
            real S = {actual}
          </text>
        </g>
        <text x={x(0)} y={height - 6} textAnchor="middle" className="mdemo-zero">
          0
        </text>
      </svg>
    </div>
  );
}
