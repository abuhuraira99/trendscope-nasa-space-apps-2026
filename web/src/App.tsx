import { Component, lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import Atlas from "./pages/Atlas";
import { useAtlas } from "./state/store";

const Cases = lazy(() => import("./pages/Cases"));
const CaseFile = lazy(() => import("./pages/CaseFile"));
const Method = lazy(() => import("./pages/Method"));
const DataPage = lazy(() => import("./pages/DataPage"));
const About = lazy(() => import("./pages/About"));
const Demo = lazy(() => import("./pages/Demo"));

// Fetch the other pages in the background so navigation is instant.
if (typeof window !== "undefined") {
  const warm = () => {
    void import("./pages/Cases");
    void import("./pages/CaseFile");
    void import("./pages/Method");
    void import("./pages/DataPage");
    void import("./pages/About");
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (ric) ric(warm);
  else window.setTimeout(warm, 1500);
}

class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="app-error">
        <h1>This page did not load</h1>
        <p>A newer version of TrendScope may have been published. Reload to get it.</p>
        <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
          Reload the page
        </button>
      </main>
    );
  }
}

function DeepLink() {
  const [params] = useSearchParams();
  const pick = useAtlas((s) => s.pick);
  const flyTo = useAtlas((s) => s.flyTo);
  const setVar = useAtlas((s) => s.setVar);
  useEffect(() => {
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    const v = params.get("v");
    if (v) setVar(v);
    if (params.has("lat") && params.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
      pick({ lat, lon });
      flyTo(lat, lon, 2.7);
    }
    // only on first load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar />
      <PageBoundary>
      <Suspense fallback={<div className="page-loading" aria-busy="true" />}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <DeepLink />
                <Atlas />
              </>
            }
          />
          <Route path="/cases" element={<Cases />} />
          <Route path="/cases/:id" element={<CaseFile />} />
          <Route path="/method" element={<Method />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/demo" element={<Demo />} />
          <Route path="*" element={<Atlas />} />
        </Routes>
      </Suspense>
      </PageBoundary>
    </BrowserRouter>
  );
}
