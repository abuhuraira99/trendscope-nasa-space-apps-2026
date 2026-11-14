import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes, useSearchParams } from "react-router-dom";
import TopBar from "./components/TopBar";
import Atlas from "./pages/Atlas";
import { useAtlas } from "./state/store";

const Cases = lazy(() => import("./pages/Cases"));
const CaseFile = lazy(() => import("./pages/CaseFile"));
const Method = lazy(() => import("./pages/Method"));
const DataPage = lazy(() => import("./pages/DataPage"));
const About = lazy(() => import("./pages/About"));

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
          <Route path="*" element={<Atlas />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
