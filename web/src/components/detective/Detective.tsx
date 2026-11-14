import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { VARIABLES, variablesFor, type Landscape, type VarId } from "../../content/variables";
import { cellIndex, loadTrend, type VarMeta } from "../../lib/data/grids";
import { info, type Sphere } from "../../lib/catalog";
import { rampColor } from "../../lib/color/ramps";
import { coord, pValue, signed } from "../../lib/format";
import { useAtlas } from "../../state/store";
import SearchBox from "../SearchBox";
import "./detective.css";

type Theme = Sphere | "any";

const THEMES: { id: Theme; label: string; hint: string }[] = [
  { id: "heat", label: "Heat", hint: "Temperature, humid heat, cooling demand" },
  { id: "water", label: "Water", hint: "Rain, soil water, evaporation, stored water" },
  { id: "ice", label: "Ice and snow", hint: "Sea ice and snow cover" },
  { id: "air", label: "The sky", hint: "Haze, ozone, clouds, sunlight, wind" },
  { id: "life", label: "Plants", hint: "How green the land is" },
  { id: "any", label: "Anything", hint: "Scan every variable and show the strongest signal" },
];

interface PlaceChoice {
  lat: number;
  lon: number;
  name: string;
  landscape?: Landscape;
}

/** Example places for each landscape, chosen to be representative of it. */
const LANDSCAPES: { id: Landscape; label: string; place: PlaceChoice }[] = [
  { id: "megacity", label: "A megacity", place: { name: "Lahore, Pakistan", lat: 31.55, lon: 74.34 } },
  { id: "farmland", label: "Farmland", place: { name: "North China Plain", lat: 36.5, lon: 116.25 } },
  { id: "desert", label: "A desert", place: { name: "Sahara, southern Algeria", lat: 24.0, lon: 3.75 } },
  { id: "rainforest", label: "A rainforest", place: { name: "Central Amazon, Brazil", lat: -4.0, lon: -62.5 } },
  { id: "monsoon", label: "A monsoon region", place: { name: "Ganges delta, Bangladesh", lat: 23.5, lon: 90.0 } },
  { id: "mountains", label: "High mountains", place: { name: "Tibetan Plateau", lat: 33.0, lon: 88.75 } },
  { id: "polar", label: "The Arctic", place: { name: "Barents Sea", lat: 78.0, lon: 40.0 } },
  { id: "coast", label: "A coastline", place: { name: "Mediterranean coast, Spain", lat: 37.0, lon: -2.5 } },
  { id: "ocean", label: "Open ocean", place: { name: "Equatorial Pacific", lat: 0.0, lon: -140.0 } },
];

interface Finding {
  id: string;
  slope: number;
  p: number;
  sig: number;
}

function slopeScale(m: VarMeta) {
  return Math.max(Math.abs(m.slopeRange[0]), Math.abs(m.slopeRange[1])) || 1;
}

export default function Detective({ metas, onDone }: { metas: VarMeta[]; onDone: () => void }) {
  const [theme, setTheme] = useState<Theme | null>(null);
  const [place, setPlace] = useState<PlaceChoice | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const { pick, flyTo, setVar, setFocusVar } = useAtlas();

  const candidates = useMemo(() => {
    if (!theme) return [];
    return metas.filter((m) => theme === "any" || info(m.id).sphere === theme);
  }, [metas, theme]);

  useEffect(() => {
    if (!place || !candidates.length) return;
    let alive = true;
    setFindings(null);
    flyTo(place.lat, place.lon, 2.9);
    Promise.all(
      candidates.map((m) =>
        loadTrend(m).then((g) => {
          const i = cellIndex(m.grid, place.lat, place.lon);
          if (i < 0 || !Number.isFinite(g.slope[i])) return null;
          return { id: m.id, slope: g.slope[i], p: g.p[i], sig: g.sig[i] } as Finding;
        }),
      ),
    ).then((rows) => {
      if (!alive) return;
      const list = rows.filter((r): r is Finding => !!r).sort((a, b) => b.sig - a.sig || a.p - b.p);
      setFindings(list);
      if (list[0]) setVar(list[0].id);
    });
    return () => {
      alive = false;
    };
  }, [place, candidates, flyTo, setVar]);

  const suggested: VarId[] = place?.landscape ? variablesFor(place.landscape).filter((v) => metas.some((m) => m.id === v)) : [];
  const top = findings?.[0];
  const topInfo = top ? info(top.id) : null;

  const reset = () => {
    setTheme(null);
    setPlace(null);
    setFindings(null);
  };

  return (
    <div className="det">
      {!theme && (
        <section className="det-step" aria-labelledby="det-q1">
          <h2 id="det-q1">What do you want to investigate?</h2>
          <div className="det-options">
            {THEMES.filter((t) => t.id === "any" || metas.some((m) => info(m.id).sphere === t.id)).map((t) => (
              <button key={t.id} type="button" className="det-option" onClick={() => setTheme(t.id)}>
                <strong>{t.label}</strong>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {theme && !place && (
        <section className="det-step" aria-labelledby="det-q2">
          <button type="button" className="det-back" onClick={() => setTheme(null)}>
            <ArrowLeft size={14} strokeWidth={1.75} /> Change the question
          </button>
          <h2 id="det-q2">Where should we look?</h2>
          <div className="det-search">
            <SearchBox
              placeholder="Type a place you care about"
              onSelect={(h) => setPlace({ lat: h.lat, lon: h.lon, name: [h.name, h.detail].filter(Boolean).join(", ") })}
            />
          </div>
          <p className="det-or">Or pick a kind of place</p>
          <div className="det-chips">
            {LANDSCAPES.map((l) => (
              <button key={l.id} type="button" className="det-chip" onClick={() => setPlace({ ...l.place, landscape: l.id })}>
                {l.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {theme && place && (
        <section className="det-step det-report" aria-live="polite" aria-labelledby="det-r">
          <button type="button" className="det-back" onClick={() => setPlace(null)}>
            <ArrowLeft size={14} strokeWidth={1.75} /> Choose another place
          </button>
          <p className="det-place">
            {place.name} <span className="num">{coord(place.lat, place.lon)}</span>
          </p>
          {!findings && <div className="sk-block" style={{ height: 120 }} />}
          {findings && top && topInfo && (
            <>
              <h2 id="det-r">
                {top.sig >= 2
                  ? `The strongest signal here: ${topInfo.name.toLowerCase()}, ${top.slope > 0 ? topInfo.increaseWord : topInfo.decreaseWord}.`
                  : `Nothing in this group passes the strict test here. The closest is ${topInfo.name.toLowerCase()}.`}
              </h2>
              <p className="det-sub num">
                {signed(top.slope, topInfo.decimals)} {topInfo.unitsLabel} per decade · p {pValue(top.p)}
              </p>
              <ul className="det-list">
                {findings.map((f) => {
                  const v = info(f.id);
                  const m = metas.find((x) => x.id === f.id)!;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setVar(f.id);
                          setFocusVar(f.id);
                        }}
                      >
                        <span className="det-dot" style={{ background: f.sig >= 1 ? rampColor(v.ramp, Math.sign(f.slope) * Math.max(0.62, Math.min(1, Math.abs(f.slope) / slopeScale(m)))) : "transparent" }} />
                        <span>{v.shortName}</span>
                        <span className="num">
                          {signed(f.slope, v.decimals)} {v.unitsLabel}
                        </span>
                        <span className={`det-ev ${f.sig >= 2 ? "is-strong" : ""}`}>{f.sig >= 2 ? "Significant" : f.sig >= 1 ? "Possible" : "Not clear"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {suggested.length > 0 && (
                <p className="det-why">
                  For {LANDSCAPES.find((l) => l.id === place.landscape)?.label.toLowerCase()}, scientists often watch{" "}
                  {suggested
                    .slice(0, 4)
                    .map((v) => VARIABLES[v].name.toLowerCase())
                    .join(", ")}
                  . {suggested[0] && VARIABLES[suggested[0]].whyItMatters}
                </p>
              )}
              <div className="det-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setFocusVar(top.id);
                    pick({ lat: place.lat, lon: place.lon, name: place.name });
                    onDone();
                  }}
                >
                  <SearchIcon size={16} strokeWidth={1.75} /> Open the full investigation
                </button>
                <button className="btn btn-quiet" type="button" onClick={reset}>
                  New case
                </button>
              </div>
            </>
          )}
          {findings && !top && <p className="det-sub">No data covers this point for the chosen group. Try another place.</p>}
        </section>
      )}
    </div>
  );
}
