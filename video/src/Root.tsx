import { Composition } from "remotion";
import { Demo } from "./Demo";
import type { Manifest } from "./manifest";
import { T } from "./theme";

const empty: Manifest = {};

export function Root() {
  return (
    <Composition
      id="TrendScopeDemo"
      component={Demo}
      durationInFrames={T.durationInFrames}
      fps={T.fps}
      width={T.width}
      height={T.height}
      defaultProps={empty}
    />
  );
}
