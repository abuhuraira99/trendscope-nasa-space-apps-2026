import { AbsoluteFill } from "remotion";
import { C, fall, rise } from "../theme";
import { MONO, SANS } from "../fonts";

const NAMES = ["Abu Huraira", "Hafiz Muhammad Haris", "Muhammad Zawar Khan", "Sania Shafiq", "Muhammad Mohsin"];

/** 0:00 to 0:02. Team and event. */
export function TitleScene({ frame }: { frame: number }) {
  if (frame > 66) return null;
  const out = fall(frame, 52, 12);
  const a = rise(frame, 0, 16);
  const b = rise(frame, 3, 18);
  const line = rise(frame, 8, 26);
  return (
    <AbsoluteFill style={{ opacity: out, justifyContent: "center", paddingLeft: 160, paddingRight: 160 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 22,
          color: C.ink2,
          letterSpacing: "0.01em",
          opacity: a,
          transform: `translateY(${(1 - a) * 14}px)`,
        }}
      >
        NASA Space Apps Challenge 2026
      </div>
      <div
        style={{
          marginTop: 18,
          fontFamily: SANS,
          fontWeight: 600,
          fontSize: 116,
          lineHeight: 1,
          letterSpacing: "-0.035em",
          color: C.ink,
          opacity: b,
          transform: `translateY(${(1 - b) * 26}px)`,
        }}
      >
        Team TrendScope
      </div>
      <div
        style={{
          marginTop: 44,
          height: 1,
          width: 1600,
          background: C.lineStrong,
          transformOrigin: "0 50%",
          transform: `scaleX(${line})`,
        }}
      />
      <div style={{ marginTop: 30, display: "flex", gap: 52, flexWrap: "nowrap" }}>
        {NAMES.map((n, i) => {
          const k = rise(frame, 9 + i * 3, 16);
          return (
            <span
              key={n}
              style={{
                fontFamily: SANS,
                fontWeight: 500,
                fontSize: 28,
                color: C.ink2,
                whiteSpace: "nowrap",
                opacity: k,
                transform: `translateY(${(1 - k) * 12}px)`,
              }}
            >
              {n}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
