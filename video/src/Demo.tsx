import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from "remotion";
import type { Manifest } from "./manifest";
import { C, T, fall } from "./theme";
import { SANS } from "./fonts";
import { TitleScene } from "./scenes/TitleScene";
import { ChallengeScene } from "./scenes/ChallengeScene";
import { HeroScene } from "./scenes/HeroScene";
import { AppScene } from "./scenes/AppScene";
import { FutureScene } from "./scenes/FutureScene";

/** Required disclosure: the video was made with an AI coding agent. Small, quiet, always on. */
function Watermark() {
  return (
    <div
      style={{
        position: "absolute",
        right: 22,
        bottom: 14,
        fontFamily: SANS,
        fontWeight: 500,
        fontSize: 11,
        lineHeight: 1,
        letterSpacing: "0.02em",
        color: C.ink,
        opacity: 0.45,
      }}
    >
      Made with SI assistance
    </div>
  );
}

export function Demo(props: Manifest) {
  const frame = useCurrentFrame();
  const end = fall(frame, T.durationInFrames - 22, 22);
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <AbsoluteFill style={{ opacity: end }}>
        <TitleScene frame={frame} />
        <ChallengeScene frame={frame} />
        <HeroScene frame={frame} manifest={props} />
        <AppScene frame={frame} manifest={props} />
        <FutureScene frame={frame} manifest={props} />
      </AbsoluteFill>
      <Watermark />
      <Audio src={staticFile("music.wav")} volume={0.9} />
    </AbsoluteFill>
  );
}
