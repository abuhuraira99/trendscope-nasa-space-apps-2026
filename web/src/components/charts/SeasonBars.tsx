import { useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { scaleLinear } from "d3-scale";
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

/** A column with a 4px rounded tip and a square base on the zero line. */
function barPath(x: number, w: number, tip: number, zero: number): string {
  const h = Math.abs(tip - zero);
  if (h < 1) return `M${x},${zero - 0.5}h${w}v1h${-w}Z`;
  const r = Math.min(4, h, w / 2);
  if (tip < zero) {
    return `M${x},${zero}V${tip + r}Q${x},${tip} ${x + r},${tip}H${x + w - r}Q${x + w},${tip} ${x + w},${tip + r}V${zero}Z`;
  }
  return `M${x},${zero}V${tip - r}Q${x},${tip} ${x + r},${tip}H${x + w - r}Q${x + w},${tip} ${x + w},${tip - r}V${zero}Z`;
}

/**
 * Trend by calendar month. A readout above the bars always shows one month (the strongest by
 * default); tapping, clicking, hovering or arrow keys choose another, so touch and mouse get the
 * same information.
 */
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
  const ref = useRef<HTMLElement | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const width = useElementWidth(ref, 400);

  const dataKey = bars.map((b) => `${b.month}:${b.slopePerDecade}:${b.significant}`).join("|");
  const valid = bars.filter((b) => b.slopePerDecade !== null);
  const strongest = valid.length
    ? valid.reduce((a, b) => (Math.abs(b.slopePerDecade ?? 0) > Math.abs(a.slopePerDecade ?? 0) ? b : a)).month
    : (bars[0]?.month ?? 1);

  // A pinned month belongs to the data it was chosen on, so a new place starts at its strongest month.
  const [pin, setPin] = useState<{ key: string; month: number } | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const pinned = pin && pin.key === dataKey ? pin.month : null;
  const active = hover ?? pinned ?? strongest;
  // A deliberate choice (tap, click, key) wins over wherever the mouse happens to rest.
  const choose = (month: number) => {
    setPin({ key: dataKey, month });
    setHover(null);
  };

  const vals = bars.map((b) => b.slopePerDecade ?? 0);
  const maxAbs = Math.max(scale * 0.5, ...vals.map(Math.abs)) || 1;
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (lo === hi) {
    lo = -1;
    hi = 1;
  }
  const pad = (hi - lo) * 0.06;
  const labelH = 22;
  const y = scaleLinear()
    .domain([lo < 0 ? lo - pad : 0, hi > 0 ? hi + pad : 0])
    .range([height - labelH - 2, 8]);
  const zero = y(0);
  const colW = width / 12;
  const barW = Math.max(6, Math.min(24, colW * 0.56));
  const colorOf = (b: SeasonBar) => rampColor(ramp, (b.slopePerDecade ?? 0) / maxAbs);

  const current = bars.find((b) => b.month === active) ?? bars[0];
  const currentColor = current ? colorOf(current) : "transparent";
  const describe = (b: SeasonBar) =>
    b.slopePerDecade === null
      ? `${MONTH_NAMES[b.month - 1]}: not enough data`
      : `${MONTH_NAMES[b.month - 1]}: ${signed(b.slopePerDecade, decimals)} ${units} per decade, ${b.significant ? "significant on its own" : "could be chance"}`;

  // One plain sentence that needs no interaction.
  const ups = valid.filter((b) => (b.slopePerDecade ?? 0) > 0);
  const downs = valid.filter((b) => (b.slopePerDecade ?? 0) < 0);
  const nameOf = (b: SeasonBar) => MONTH_NAMES[b.month - 1];
  const top = (list: SeasonBar[], sign: 1 | -1) => list.reduce((a, b) => ((b.slopePerDecade ?? 0) * sign > (a.slopePerDecade ?? 0) * sign ? b : a));
  let summary = "";
  if (ups.length && downs.length) summary = `Rises most in ${nameOf(top(ups, 1))} and falls most in ${nameOf(top(downs, -1))}.`;
  else if (ups.length) summary = ups.length === valid.length ? `Rises in every month, most in ${nameOf(top(ups, 1))}.` : `Rises most in ${nameOf(top(ups, 1))}.`;
  else if (downs.length) summary = downs.length === valid.length ? `Falls in every month, most in ${nameOf(top(downs, -1))}.` : `Falls most in ${nameOf(top(downs, -1))}.`;
  if (valid.length) {
    const sig = valid.filter((b) => b.significant).length;
    summary += ` ${sig} of ${valid.length} months ${sig === 1 ? "is significant on its own" : "are significant on their own"}.`;
  }

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = Math.min(bars.length - 1, index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = Math.max(0, index - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = bars.length - 1;
    else return;
    e.preventDefault();
    choose(bars[next].month);
    buttons.current[next]?.focus();
  };

  const activeIndex = Math.max(0, bars.findIndex((b) => b.month === active));

  return (
    <figure className="sbars" ref={ref}>
      {current && (
        <div className="sbars-readout" aria-live="polite">
          <div className="sbars-read">
            <div className="sbars-month">
              {MONTH_NAMES[current.month - 1]}
              {current.month === strongest && valid.length > 1 && <span className="sbars-tag">Strongest month</span>}
            </div>
            <div className="sbars-value">
              <span className="sbars-num">{current.slopePerDecade === null ? "–" : signed(current.slopePerDecade, decimals)}</span>
              <span className="sbars-unit">{units} per decade</span>
            </div>
          </div>
          <span className="sbars-status">
            <i
              className={`sbars-swatch ${current.significant ? "is-solid" : "is-hatched"}`}
              style={{ "--c": currentColor } as CSSProperties}
              aria-hidden
            />
            {current.slopePerDecade === null ? "Not enough data" : current.significant ? "Significant on its own" : "Could be chance"}
          </span>
        </div>
      )}

      <div className="sbars-plot" style={{ height }} onPointerLeave={() => setHover(null)}>
        <svg key={dataKey} width={width} height={height} aria-hidden="true">
          <defs>
            {bars.map((b) =>
              b.significant || b.slopePerDecade === null ? null : (
                <pattern key={b.month} id={`${uid}-h${b.month}`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={1.5} height={4} fill={colorOf(b)} fillOpacity={0.8} />
                </pattern>
              ),
            )}
          </defs>
          <rect
            className="sbars-sel"
            x={0}
            y={0}
            width={Math.max(0, colW - 4)}
            height={height}
            rx={6}
            style={{ transform: `translateX(${activeIndex * colW + 2}px)` }}
          />
          <line x1={0} x2={width} y1={zero} y2={zero} className="season-zero" />
          {bars.map((b, i) => {
            const v = b.slopePerDecade ?? 0;
            const x = i * colW + (colW - barW) / 2;
            const d = barPath(x, barW, y(v), zero);
            const fill = colorOf(b);
            return (
              <g key={b.month} className={`sbars-bar${v < 0 ? " is-neg" : ""}`} style={{ animationDelay: `${i * 28}ms` }}>
                {b.slopePerDecade === null ? null : b.significant ? (
                  <path d={d} fill={fill} />
                ) : (
                  <>
                    <path d={d} fill={fill} fillOpacity={0.14} />
                    <path d={d} fill={`url(#${uid}-h${b.month})`} />
                  </>
                )}
              </g>
            );
          })}
          {bars.map((b, i) => (
            <text
              key={b.month}
              x={i * colW + colW / 2}
              y={height - 6}
              textAnchor="middle"
              className={`season-label${b.month === active ? " is-active" : ""}`}
            >
              {MONTHS[b.month - 1]}
            </text>
          ))}
        </svg>
        <div className="sbars-hits" role="group" aria-label="Trend by calendar month. Use the arrow keys to move between months.">
          {bars.map((b, i) => (
            <button
              key={b.month}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              className="sbars-hit"
              aria-label={describe(b)}
              aria-pressed={b.month === active}
              tabIndex={b.month === active ? 0 : -1}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHover(b.month);
              }}
              onClick={() => choose(b.month)}
              onFocus={() => choose(b.month)}
              onKeyDown={(e) => onKey(e, i)}
            />
          ))}
        </div>
      </div>

      {summary && <p className="sbars-summary">{summary}</p>}
    </figure>
  );
}
