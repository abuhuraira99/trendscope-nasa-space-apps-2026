import { create } from "zustand";

export interface Place {
  lat: number;
  lon: number;
  name?: string;
}

export interface ViewTarget {
  lat: number;
  lon: number;
  distance: number;
}

interface AtlasState {
  varId: string;
  sigOnly: boolean;
  mode: "trend" | "year";
  year: number | null;
  playing: boolean;
  place: Place | null;
  focusVar: string | null;
  view: ViewTarget;
  viewNonce: number;
  setVar: (id: string) => void;
  setSigOnly: (v: boolean) => void;
  setMode: (m: "trend" | "year") => void;
  setYear: (y: number | null) => void;
  setPlaying: (p: boolean) => void;
  pick: (p: Place | null) => void;
  setFocusVar: (id: string | null) => void;
  flyTo: (lat: number, lon: number, distance?: number) => void;
}

export const useAtlas = create<AtlasState>((set, get) => ({
  varId: "t2m",
  sigOnly: false,
  mode: "trend",
  year: null,
  playing: false,
  place: null,
  focusVar: null,
  view: { lat: 22, lon: 62, distance: 3.75 },
  viewNonce: 0,
  setVar: (id) => set({ varId: id }),
  setSigOnly: (v) => set({ sigOnly: v }),
  setMode: (m) => set({ mode: m, playing: m === "trend" ? false : get().playing }),
  setYear: (y) => set({ year: y }),
  setPlaying: (p) => set({ playing: p }),
  pick: (p) => set({ place: p, focusVar: p ? get().focusVar : null }),
  setFocusVar: (id) => set({ focusVar: id }),
  flyTo: (lat, lon, distance) =>
    set((s) => ({ view: { lat, lon, distance: distance ?? s.view.distance }, viewNonce: s.viewNonce + 1 })),
}));
