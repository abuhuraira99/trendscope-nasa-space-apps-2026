import { useRef } from "react";
import { scaleBand, scaleLinear } from "d3-scale";
import { rampColor, type RampKind } from "../../lib/color/ramps";
import { signed } from "../../lib/format";
import { useElementWidth } from "./useElementWidth";
import "./charts.css";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export interface SeasonBar {
  month: number;
  slopePerDecade: number | null;
  significant: boolean;
}

export default function SeasonBars({
  bars,
  scale,
  ramp,
  units,
  decimals = 2,
  height = 120,
}: {
  bars: SeasonBar[];
  scale: number;
  ramp: RampKind;
  units: string;
  decimals?: number;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const width = useElementWidth(ref, 400);
  const maxAbs = Math.max(scale, ...bars.map((b) => Math.abs(b.slopePerDecade ?? 0))) || 1;
  const x = scaleBand<number>()
    .domain(bars.map((b) => b.month))
    .range([4, width - 4])
    .padding(0.28);
  const y = scaleLinear().domain([-maxAbs, maxAbs]).range([height - 20, 6]);
  const zero = y(0);
  const summary = bars
    .filter((b) => b.slopePerDecade !== null)
    .map((b) => `${MONTH_NAMES[b.month - 1]} ${signed(b.slopePerDecade, decimals)} ${units} per decade${b.significant ? ", significant" : ""}`)
    .join("; ");
  return (
    <figure className="chart" ref={ref} style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={`Trend by calendar month: ${summary}`}>
        <line x1={0} x2={width} y1={zero} y2={zero} className="season-zero" />
        {bars.map((b) => {
          const v = b.slopePerDecade ?? 0;
          const top = Math.min(y(v), zero);
          const h = Math.max(1, Math.abs(y(v) - zero));
          const fill = rampColor(ramp, v / maxAbs);
          return (
            <g key={b.month}>
              <rect
                x={x(b.month)}
                y={top}
                width={x.bandwidth()}
                height={h}
                rx={1.5}
                style={b.significant ? { fill } : { fill: "transparent", stroke: fill, strokeWidth: 1.25 }}
              >
                <title>{`${MONTH_NAMES[b.month - 1]}: ${signed(b.slopePerDecade, decimals)} ${units} per decade${b.significant ? " (significant)" : ""}`}</title>
              </rect>
              <text x={(x(b.month) ?? 0) + x.bandwidth() / 2} y={height - 5} textAnchor="middle" className="season-label">
                {MONTHS[b.month - 1]}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
