import { AbsoluteFill, interpolate } from "remotion";
import type { Manifest } from "../manifest";
import { C, T, fall, rise } from "../theme";
import { SANS } from "../fonts";
import { GlobeBackdrop } from "./GlobeBackdrop";

const FROM = T.globeClip.heroFrom; // 140
const END = 308;

/** 0:05 to 0:10. Name and promise over the real globe. */
export function HeroScene({ frame, manifest }: { frame: number; manifest: Manifest }) {
  if (frame < FROM || frame > END) return null;
  const globeIn = rise(frame, FROM, 22);
  const out = fall(frame, 292, 16);
  const scale = interpolate(frame, [FROM, END], [0.84, 0.875]);
  const w = rise(frame, 152, 24);
  const tg = rise(frame, 163, 26);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <AbsoluteFill style={{ opacity: globeIn }}>
        <GlobeBackdrop manifest={manifest} index={frame - FROM} scale={scale} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160 }}>
        <div
          style={{
            fontFamily: SANS,
            fontWeight: 600,
            fontSize: 136,
            lineHeight: 1,
            letterSpacing: "-0.045em",
            color: C.ink,
            opacity: w,
            transform: `translateY(${(1 - w) * 30}px)`,
          }}
        >
          TrendScope
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: SANS,
            fontWeight: 500,
            fontSize: 44,
            lineHeight: 1.18,
            letterSpacing: "-0.02em",
            color: C.ink2,
            opacity: tg,
            transform: `translateY(${(1 - tg) * 22}px)`,
          }}
        >
          See where Earth is changing,
          <br />
          and prove it.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
