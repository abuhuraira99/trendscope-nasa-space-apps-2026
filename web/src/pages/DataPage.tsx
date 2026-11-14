import { useVarsFile } from "../lib/data/hooks";
import { info, SPHERES } from "../lib/catalog";
import { rampCss } from "../lib/color/ramps";
import {
  SOURCES,
  DATASET_SOURCES,
  METHOD_SOURCES,
  RELATED_TOOLS,
  POWER_ACKNOWLEDGMENT,
  citation,
  type SourceId,
  type Source,
} from "../content/sources";
import "../styles/page.css";
import "./datapage.css";

function gridText(g: { dlat: number; dlon: number }) {
  return g.dlat === g.dlon ? `${g.dlat}°` : `${g.dlat}° × ${g.dlon}°`;
}

export default function DataPage() {
  const vars = useVarsFile();
  const metas = vars.status === "ready" ? vars.data.vars : [];
  return (
    <main id="main" className="page">
      <div className="page-wrap">
        <header className="page-head">
          <h1>The data behind every verdict</h1>
          <p className="page-lede">
            Every map and number in TrendScope comes from open NASA data. This page lists each variable, where it comes from, the years it
            covers and how to cite it. The processed maps can be downloaded too.
          </p>
        </header>

        <section className="page-section" aria-labelledby="vars-h">
          <header>
            <h2 id="vars-h">Variables</h2>
            <p>{metas.length} global maps, each tested at every grid cell.</p>
          </header>
          <div className="dtable" role="table" aria-label="Variables">
            <div className="drow dhead" role="row">
              <span role="columnheader">Variable</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Years</span>
              <span role="columnheader">Grid</span>
              <span role="columnheader">Share changing</span>
            </div>
            {SPHERES.flatMap((sp) =>
              metas
                .filter((m) => info(m.id).sphere === sp.id)
                .map((m) => {
                  const v = info(m.id);
                  const share = m.summary.validCells ? (m.summary.fdrUp + m.summary.fdrDown) / m.summary.validCells : 0;
                  return (
                    <div className="drow" role="row" key={m.id}>
                      <span role="cell" className="dvar">
                        <span className="dswatch" style={{ background: rampCss(v.ramp) }} aria-hidden />
                        <span>
                          <strong>{v.name}</strong>
                          {v.plain && <small>{v.plain}</small>}
                        </span>
                      </span>
                      <span role="cell">{m.source ?? v.sourceLine}</span>
                      <span role="cell" className="num">
                        {m.years[0]}–{m.years[1]}
                      </span>
                      <span role="cell" className="num">
                        {gridText(m.grid)}
                      </span>
                      <span role="cell" className="num">
                        {(share * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                }),
            )}
          </div>
          <p className="dnote">
            "Share changing" is the fraction of grid cells whose trend passes the false discovery rate test. Download the processed data:{" "}
            <a href="/data/vars.json">catalogue (JSON)</a> and the maps under <code>/data/grid/</code>, described in the project's{" "}
            <a href="https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026/blob/main/docs/build-spec.md">build specification</a>.
          </p>
        </section>

        <SourceSection id="datasets" title="Datasets" lede="Cited as their providers ask." ids={DATASET_SOURCES}>
          <p className="dack">{POWER_ACKNOWLEDGMENT}</p>
        </SourceSection>
        <SourceSection id="methods" title="Methods" lede="The papers behind each test." ids={METHOD_SOURCES} />
        <SourceSection
          id="tools"
          title="Related NASA tools"
          lede="Listed in the challenge resources. TrendScope complements them with tested trend maps."
          ids={RELATED_TOOLS}
        />
      </div>
    </main>
  );
}

function SourceSection({
  id,
  title,
  lede,
  ids,
  children,
}: {
  id: string;
  title: string;
  lede: string;
  ids: readonly SourceId[];
  children?: React.ReactNode;
}) {
  return (
    <section className="page-section" aria-labelledby={`${id}-h`}>
      <header>
        <h2 id={`${id}-h`}>{title}</h2>
        <p>{lede}</p>
      </header>
      <div>
        <ul className="slist">
          {ids.map((sid) => {
            const s = SOURCES[sid] as Source;
            if (!s) return null;
            return (
              <li key={sid}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
                <span>{citation(s)}</span>
                {s.note && <small>{s.note}</small>}
              </li>
            );
          })}
        </ul>
        {children}
      </div>
    </section>
  );
}
