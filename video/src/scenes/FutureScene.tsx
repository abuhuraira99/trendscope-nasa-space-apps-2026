import { AbsoluteFill, interpolate } from "remotion";
import type { Manifest } from "../manifest";
import { C, T, fall, rise } from "../theme";
import { MONO, SANS } from "../fonts";
import { GlobeBackdrop } from "./GlobeBackdrop";

const FROM = T.globeClip.futureFrom; // 620
const CLIP_START = T.globeClip.futureClipStart;

/** 0:21 to 0:29. Who it is for, and where to find it. */
export function FutureScene({ frame, manifest }: { frame: number; manifest: Manifest }) {
  if (frame < FROM) return null;
  const inn = rise(frame, FROM, 22);
  const scale = interpolate(frame, [FROM, T.durationInFrames], [1.045, 1.1]);
  const shift = interpolate(frame, [FROM, T.durationInFrames], [400, 460]);

  const a = rise(frame, 634, 22);
  const aOut = fall(frame, 742, 12);
  const u = rise(frame, 756, 24);
  const s = rise(frame, 766, 24);
  const line = rise(frame, 760, 30);

  return (
    <AbsoluteFill style={{ opacity: inn }}>
      <GlobeBackdrop manifest={manifest} index={CLIP_START + (frame - FROM)} scale={scale} shift={shift} />
      {frame < 756 && (
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160 }}>
          <div
            style={{
              maxWidth: 820,
              fontFamily: SANS,
              fontWeight: 600,
              fontSize: 68,
              lineHeight: 1.08,
              letterSpacing: "-0.03em",
              color: C.ink,
              opacity: a * aOut,
              transform: `translateY(${(1 - a) * 26 - (1 - aOut) * 14}px)`,
            }}
          >
            Free and open, for students, cities and climate planners.
          </div>
        </AbsoluteFill>
      )}
      {frame >= 750 && (
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 160 }}>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 500,
                fontSize: 52,
                letterSpacing: "-0.02em",
                color: C.ink,
                opacity: u,
                transform: `translateY(${(1 - u) * 24}px)`,
              }}
            >
              trendscope-earth.pages.dev
            </div>
            <div
              style={{
                marginTop: 28,
                height: 1,
                width: 560,
                background: C.lineStrong,
                transformOrigin: "0 50%",
                transform: `scaleX(${line})`,
              }}
            />
            <div
              style={{
                marginTop: 24,
                fontFamily: SANS,
                fontWeight: 500,
                fontSize: 32,
                letterSpacing: "-0.01em",
                color: C.ink2,
                opacity: s,
                transform: `translateY(${(1 - s) * 16}px)`,
              }}
            >
              Built with NASA open data
            </div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
