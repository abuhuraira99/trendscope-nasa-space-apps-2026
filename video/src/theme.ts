import { Easing, interpolate } from "remotion";
import timeline from "../timeline.json";

export const T = timeline;
export const FPS = timeline.fps;

/** The app's palette (web/src/styles/global.css and lib/color/ramps.ts). */
export const C = {
  ground: "#0B0D10",
  panel: "#12151A",
  line: "#23272E",
  lineStrong: "#353B44",
  ink: "#ECE8E1",
  ink2: "#A8ADB5",
  ink3: "#7B818A",
  warm: "#CF5B34",
  warmHi: "#FFBF94",
  cool: "#5F9FD6",
} as const;

/** The app's motion curve: cubic-bezier(0.16, 1, 0.3, 1), a confident exponential ease-out. */
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** 0 to 1 over [start, start + duration] frames, eased out. */
export function rise(frame: number, start: number, duration: number) {
  return interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
}

/** 1 to 0 over [start, start + duration] frames. */
export function fall(frame: number, start: number, duration: number) {
  return interpolate(frame, [start, start + duration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
}

export const sec = (s: number) => Math.round(s * FPS);
