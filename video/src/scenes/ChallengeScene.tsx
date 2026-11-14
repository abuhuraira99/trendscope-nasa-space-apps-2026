import { AbsoluteFill, interpolateColors } from "remotion";
import { C, fall, rise } from "../theme";
import { MONO, SANS } from "../fonts";

/** 0:02 to 0:05. The question the challenge asks. */
export function ChallengeScene({ frame }: { frame: number }) {
  if (frame < 56 || frame > 156) return null;
  const inn = rise(frame, 58, 14);
  const out = fall(frame, 140, 14);
  const l1 = rise(frame, 60, 20);
  const l2 = rise(frame, 76, 22);
  const dim = rise(frame, 82, 20);
  const big = {
    fontFamily: SANS,
    fontWeight: 600,
    fontSize: 80,
    lineHeight: 1.08,
    letterSpacing: "-0.03em",
  } as const;
  return (
    <AbsoluteFill style={{ opacity: inn * out, justifyContent: "center", paddingLeft: 160, paddingRight: 160 }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 22,
          color: C.ink2,
          marginBottom: 34,
          opacity: l1,
          transform: `translateY(${(1 - l1) * 12}px)`,
        }}
      >
        Challenge: Be An Earth System Trend Detective!
      </div>
      <div
        style={{
          ...big,
          color: interpolateColors(dim, [0, 1], [C.ink, C.ink2]),
          opacity: l1,
          transform: `translateY(${(1 - l1) * 24}px)`,
        }}
      >
        Earth is changing.
      </div>
      <div style={{ ...big, color: C.ink, opacity: l2, transform: `translateY(${(1 - l2) * 24}px)` }}>
        But where, by how much, and is it real?
      </div>
    </AbsoluteFill>
  );
}
