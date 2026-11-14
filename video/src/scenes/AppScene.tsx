import { AbsoluteFill, interpolate } from "remotion";
import { Footage } from "../Footage";
import type { Manifest } from "../manifest";
import { C, FPS, T, easeOut, fall, rise, sec } from "../theme";
import { SANS } from "../fonts";

const START = T.appClip.videoStart; // first video frame of the app clip
const END = 640;
const CARD = { scale: 0.84, top: 34 };
const CARD_W = 1920 * CARD.scale;
const CARD_H = 1080 * CARD.scale;
const CARD_LEFT = (1920 - CARD_W) / 2;
const ZOOM = 1.42;

function captionText(key: string, m: Manifest) {
  if (key === "atlas") {
    const d = m.data;
    return d
      ? `${d.datasets} NASA datasets. ${d.years} years. Every place on Earth.`
      : "NASA datasets. Every place on Earth.";
  }
  if (key === "test") return "Mann-Kendall tests with false discovery control: real trends, not noise.";
  return "Lahore: humid heat rising fast while the thermometer barely moves.";
}

/** 0:10 to 0:21. The real app, recorded from the live site. */
export function AppScene({ frame, manifest }: { frame: number; manifest: Manifest }) {
  if (frame < START || frame > END) return null;
  const inn = rise(frame, 292, 18);
  const out = fall(frame, 620, 18);
  const picked = manifest.app?.marks?.picked;
  const zoomStart = picked !== undefined ? START + Math.round(picked * FPS) + 2 : sec(T.appClip.zoomInAt);
  const p = interpolate(frame, [zoomStart, zoomStart + sec(T.appClip.zoomInDuration)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const z = 1 + (ZOOM - 1) * p;
  // Keep the right edge (the investigation panel) pinned while zooming in, and drop the top bar.
  const ox = 1920 - 1920 / z;
  const oy = 40 * p;
  const enter = 0.985 + 0.015 * inn;

  return (
    <AbsoluteFill style={{ opacity: inn * out }}>
      <div
        style={{
          position: "absolute",
          left: CARD_LEFT,
          top: CARD.top,
          width: CARD_W,
          height: CARD_H,
          borderRadius: 14,
          overflow: "hidden",
          background: C.ground,
          boxShadow: `0 0 0 1px ${C.line}, 0 40px 90px -30px rgba(0,0,0,0.75)`,
          transform: `scale(${enter})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            transformOrigin: "0 0",
            transform: `scale(${CARD.scale * z}) translate(${-ox}px, ${-oy}px)`,
          }}
        >
          <Footage clip={manifest.app} index={frame - START} />
        </div>
      </div>
      {T.captions.map((c) => {
        const from = sec(c.from);
        const to = sec(c.to);
        if (frame < from - 1 || frame > to + 1) return null;
        const a = rise(frame, from, 16);
        const b = fall(frame, to - 8, 8);
        return (
          <div
            key={c.key}
            style={{
              position: "absolute",
              left: CARD_LEFT + 4,
              top: CARD.top + CARD_H + 34,
              width: CARD_W,
              fontFamily: SANS,
              fontWeight: 500,
              fontSize: 38,
              lineHeight: 1.2,
              letterSpacing: "-0.015em",
              color: C.ink,
              opacity: a * b,
              transform: `translateY(${(1 - a) * 14}px)`,
            }}
          >
            {captionText(c.key, manifest)}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
