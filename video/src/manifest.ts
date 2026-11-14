/** Written by record/record.mjs and passed to the render with --props. */
export type Rect = { x: number; y: number; width: number; height: number };

export type Manifest = {
  site?: string;
  recordedAt?: string;
  data?: { datasets: number; years: number; period: [number, number] };
  globe?: { frames: number; dir: string };
  app?: {
    frames: number;
    dir: string;
    dsf?: number;
    inspector?: Rect | null;
    marks?: { picked?: number };
    facts?: Record<string, unknown>;
  };
};
