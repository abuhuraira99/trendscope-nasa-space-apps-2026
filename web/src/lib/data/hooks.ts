import { useEffect, useState } from "react";
import { loadSeries, loadTrend, loadVars, type SeriesGrid, type TrendGrid, type VarMeta, type VarsFile } from "./grids";

export type Loadable<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; error: string };

export function useVarsFile(): Loadable<VarsFile> {
  const [s, set] = useState<Loadable<VarsFile>>({ status: "loading" });
  useEffect(() => {
    let alive = true;
    loadVars().then(
      (data) => alive && set({ status: "ready", data }),
      (e: unknown) => alive && set({ status: "error", error: String(e) }),
    );
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

export function useTrendGrid(meta: VarMeta | undefined): Loadable<TrendGrid> {
  const [s, set] = useState<Loadable<TrendGrid>>({ status: "loading" });
  useEffect(() => {
    if (!meta) return;
    let alive = true;
    set({ status: "loading" });
    loadTrend(meta).then(
      (data) => alive && set({ status: "ready", data }),
      (e: unknown) => alive && set({ status: "error", error: String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [meta]);
  return s;
}

export function useSeriesGrid(meta: VarMeta | undefined, enabled = true): Loadable<SeriesGrid> {
  const [s, set] = useState<Loadable<SeriesGrid>>({ status: "loading" });
  useEffect(() => {
    if (!meta || !enabled) return;
    let alive = true;
    set({ status: "loading" });
    loadSeries(meta).then(
      (data) => alive && set({ status: "ready", data }),
      (e: unknown) => alive && set({ status: "error", error: String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [meta, enabled]);
  return s;
}

export function usePrefersReducedMotion(): boolean {
  const [r, set] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => set(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}
