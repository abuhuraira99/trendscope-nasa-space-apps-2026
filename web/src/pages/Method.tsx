import { useState } from "react";
import { METHOD_INTRO, METHOD_SECTIONS, GLOSSARY } from "../content/method";
import { SOURCES, citation, shortCite, type SourceId } from "../content/sources";
import MethodDemo from "../components/MethodDemo";
import "../styles/page.css";
import "./method.css";

export default function Method() {
  const [depth, setDepth] = useState<"plain" | "expert">("plain");
  return (
    <main id="main" className="page">
      <div className="page-wrap">
        <header className="page-head">
          <h1>{METHOD_INTRO.title}</h1>
          <div>
            <p className="page-lede">{depth === "plain" ? METHOD_INTRO.plain : METHOD_INTRO.expert}</p>
            <div className="depth-toggle" role="group" aria-label="Level of detail" style={{ marginTop: 20 }}>
              <button type="button" aria-pressed={depth === "plain"} onClick={() => setDepth("plain")}>
                Plain language
              </button>
              <button type="button" aria-pressed={depth === "expert"} onClick={() => setDepth("expert")}>
                For scientists
              </button>
            </div>
          </div>
        </header>

        <section className="page-section method-demo-section" aria-labelledby="demo-h">
          <header>
            <h2 id="demo-h">Watch a test run</h2>
            <p>Real data: yearly wet-bulb temperature in Lahore from NASA MERRA-2.</p>
          </header>
          <MethodDemo />
        </section>

        {METHOD_SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="page-section" aria-labelledby={`${s.id}-h`}>
            <header>
              <h2 id={`${s.id}-h`}>{s.title}</h2>
              <p>{s.question}</p>
            </header>
            <div className="prose">
              {(depth === "plain" ? s.plain : s.expert).split("\n\n").map((para, i) => (
                <p key={i}>{para}</p>
              ))}
              {s.sources.length > 0 && (
                <ul className="cite-list">
                  {s.sources.map((id) => {
                    const src = SOURCES[id as SourceId];
                    if (!src) return null;
                    return (
                      <li key={id}>
                        <a href={src.url} target="_blank" rel="noreferrer" title={citation(src)}>
                          {shortCite(src)}
                        </a>{" "}
                        <span>{src.title}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        ))}

        <section className="page-section" aria-labelledby="glossary-h">
          <header>
            <h2 id="glossary-h">Words used on this site</h2>
          </header>
          <dl className="glossary">
            {GLOSSARY.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{depth === "plain" ? g.plain : g.expert}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </main>
  );
}
