import { useId, useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3-scale";
import { line } from "d3-shape";
import { fmt } from "../../lib/format";
import { useElementWidth } from "./useElementWidth";
import "./charts.css";

export interface TrendChartProps {
  years: number[];
  values: (number | null)[];
  /** Sen line: value(year) = intercept + slopePerYear * (year - firstYear) */
  sen?: { intercept: number; slopePerYear: number; firstYear: number; lastYear: number; ciPerDecade?: [number, number] };
  changeYear?: number | null;
  units: string;
  decimals?: number;
  color: string;
  height?: number;
  label: string;
  /** optional monthly anomalies (time in fractional years), drawn faintly behind */
  monthly?: { t: number; v: number }[];
  monthlyOffset?: number;
}

const M = { top: 14, right: 14, bottom: 26, left: 44 };

export default function TrendChart({
  years,
  values,
  sen,
  changeYear,
  units,
  decimals = 2,
  color,
  height = 220,
  label,
  monthly,
  monthlyOffset = 0,
}: TrendChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref, 420);
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const geo = useMemo(() => {
    const pts = years.map((y, i) => ({ y, v: values[i] })).filter((p): p is { y: number; v: number } => p.v !== null && Number.isFinite(p.v));
    let lo = Math.min(...pts.map((p) => p.v));
    let hi = Math.max(...pts.map((p) => p.v));
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo || Math.abs(hi) || 1) * (monthly?.length ? 0.3 : 0.12);
    const x = scaleLinear()
      .domain([years[0], years[years.length - 1]])
      .range([M.left, width - M.right]);
    const y = scaleLinear()
      .domain([lo - pad, hi + pad])
      .range([height - M.bottom, M.top])
      .nice(5);
    return { pts, x, y };
  }, [years, values, width, height, monthly]);

  const { pts, x, y } = geo;
  const path = line<{ y: number; v: number }>()
    .x((d) => x(d.y))
    .y((d) => y(d.v))(pts);

  const monthlyPath = monthly?.length
    ? line<{ t: number; v: number }>()
        .x((d) => x(d.t))
        .y((d) => y(d.v + monthlyOffset))(monthly)
    : null;

  let senLine: { x1: number; y1: number; x2: number; y2: number } | null = null;
  let band: string | null = null;
  if (sen && Number.isFinite(sen.slopePerYear)) {
    const f = (yr: number) => sen.intercept + sen.slopePerYear * (yr - sen.firstYear);
    senLine = { x1: x(sen.firstYear), y1: y(f(sen.firstYear)), x2: x(sen.lastYear), y2: y(f(sen.lastYear)) };
    if (sen.ciPerDecade && sen.ciPerDecade.every(Number.isFinite)) {
      const mid = (sen.firstYear + sen.lastYear) / 2;
      const fm = f(mid);
      const at = (yr: number, s: number) => fm + (s / 10) * (yr - mid);
      const [lo, hi] = sen.ciPerDecade;
      band = [
        [sen.firstYear, at(sen.firstYear, lo)],
        [sen.lastYear, at(sen.lastYear, lo)],
        [sen.lastYear, at(sen.lastYear, hi)],
        [sen.firstYear, at(sen.firstYear, hi)],
      ]
        .map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`)
        .join("") + "Z";
    }
  }

  const ticksY = y.ticks(4);
  const tickStep = ticksY.length > 1 ? Math.abs(ticksY[1] - ticksY[0]) : 1;
  const tickDecimals = Math.max(0, Math.min(4, Math.ceil(-Math.log10(tickStep) - 1e-9)));
  const span = years[years.length - 1] - years[0];
  const step = span > 30 ? 10 : 5;
  const ticksX = years.filter((yr) => yr % step === 0);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const yr = Math.round(x.invert(e.clientX - rect.left));
    const i = years.indexOf(yr);
    setHover(i >= 0 && values[i] !== null ? i : null);
  };

  const hv = hover !== null ? values[hover] : null;

  return (
    <figure className="chart" ref={ref} style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={label}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <g className="chart-grid">
          {ticksY.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={M.left} x2={width - M.right} />
              <text x={M.left - 8} dy="0.32em" textAnchor="end">
                {fmt(t, tickDecimals)}
              </text>
            </g>
          ))}
          {ticksX.map((t) => (
            <text key={t} x={x(t)} y={height - 6} textAnchor="middle">
              {t}
            </text>
          ))}
        </g>
        {band && <path d={band} className="chart-band" style={{ fill: color }} />}
        <defs>
          <clipPath id={clipId}>
            <rect x={M.left} y={M.top} width={Math.max(0, width - M.left - M.right)} height={Math.max(0, height - M.top - M.bottom)} />
          </clipPath>
        </defs>
        {monthlyPath && <path d={monthlyPath} className="chart-monthly" clipPath={`url(#${clipId})`} />}
        {path && <path d={path} className="chart-line" />}
        {pts.map((p) => (
          <circle key={p.y} cx={x(p.y)} cy={y(p.v)} r={2.4} className="chart-dot" />
        ))}
        {senLine && (
          <line {...senLine} className="chart-sen" style={{ stroke: color }} />
        )}
        {changeYear && changeYear > years[0] && changeYear <= years[years.length - 1] && (
          <g className="chart-change">
            <line x1={x(changeYear - 0.5)} x2={x(changeYear - 0.5)} y1={M.top} y2={height - M.bottom} />
            <text x={x(changeYear - 0.5) + 6} y={M.top + 10}>
              shift {changeYear}
            </text>
          </g>
        )}
        {hover !== null && hv !== null && (
          <g className="chart-hover">
            <line x1={x(years[hover])} x2={x(years[hover])} y1={M.top} y2={height - M.bottom} />
            <circle cx={x(years[hover])} cy={y(hv)} r={4.5} />
          </g>
        )}
      </svg>
      {hover !== null && hv !== null && (
        <figcaption
          className="chart-tip"
          style={{ left: Math.min(width - 130, Math.max(0, x(years[hover]) + 10)) }}
        >
          <span className="num">{years[hover]}</span>
          <strong className="num">
            {fmt(hv, decimals)} {units}
          </strong>
        </figcaption>
      )}
    </figure>
  );
}
