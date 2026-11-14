import { AbsoluteFill } from "remotion";
import { Footage } from "../Footage";
import type { Manifest } from "../manifest";
import { C } from "../theme";

/**
 * The recorded globe (app UI hidden), moved right so text can sit on the left.
 * The footage background is the app's ground colour, so the edges disappear into the frame.
 */
export function GlobeBackdrop({
  manifest,
  index,
  scale,
  shift = 400,
}: {
  manifest: Manifest;
  index: number;
  scale: number;
  shift?: number;
}) {
  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          transformOrigin: "960px 540px",
          transform: `translateX(${shift}px) scale(${scale})`,
        }}
      >
        <Footage clip={manifest.globe} index={index} />
      </AbsoluteFill>
      {/* Keep the left side calm for the words. */}
      <AbsoluteFill
        style={{
          background: `linear-gradient(90deg, ${C.ground} 0%, ${C.ground} 26%, rgba(11,13,16,0.72) 44%, rgba(11,13,16,0) 62%)`,
        }}
      />
    </AbsoluteFill>
  );
}
