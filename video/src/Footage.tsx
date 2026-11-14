import type { CSSProperties } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C } from "./theme";
import { SANS } from "./fonts";

/** One frame of a recorded image sequence, drawn at 1920x1080 CSS pixels. */
export function Footage({
  clip,
  index,
  style,
}: {
  clip?: { frames: number; dir: string };
  index: number;
  style?: CSSProperties;
}) {
  if (!clip || clip.frames <= 0) {
    return (
      <AbsoluteFill
        style={{
          width: 1920,
          height: 1080,
          background: C.panel,
          color: C.ink3,
          fontFamily: SANS,
          fontSize: 28,
          alignItems: "center",
          justifyContent: "center",
          ...style,
        }}
      >
        Footage not recorded yet
      </AbsoluteFill>
    );
  }
  const i = Math.max(0, Math.min(clip.frames - 1, Math.round(index)));
  return (
    <Img
      src={staticFile(`${clip.dir}/${String(i).padStart(4, "0")}.jpg`)}
      style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, ...style }}
    />
  );
}
