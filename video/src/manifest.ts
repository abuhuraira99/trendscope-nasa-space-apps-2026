/** Written by record/record.mjs and passed to the render with --props. */
export type Rect = { x: number; y: number; width: number; height: number };

export type Manifest = {
  site?: string;
  recordedAt?: string;
  data?: { datasets: number; years: number; period: [number, number] };
  globe?: { frames: number; dir: string; variable?: string | null };
  app?: {
    frames: number;
    dir: string;
    dsf?: number;
    inspector?: Rect | null;
    stage?: Rect | null;
    marks?: { picked?: number; scrubStart?: number; scrubEnd?: number };
    facts?: {
      verdict?: string | null;
      headline?: string | null;
      place?: string | null;
      [key: string]: unknown;
    };
  };
};
