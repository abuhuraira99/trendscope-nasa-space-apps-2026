import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { CASES } from "../content/cases";
import { info } from "../lib/catalog";
import { rampCss } from "../lib/color/ramps";
import "../styles/page.css";
import "./cases.css";

export default function Cases() {
  return (
    <main id="main" className="page">
      <div className="page-wrap">
        <header className="page-head">
          <h1>Case files</h1>
          <p className="page-lede">
            Six investigations that start with a question and end with a tested answer. Each one walks the globe step by step, and every
            number in the story is computed from NASA data as you read it.
          </p>
        </header>
        <ol className="case-list">
          {CASES.map((c) => (
            <li key={c.id}>
              <Link to={`/cases/${c.id}`} className="case-row">
                <span className="case-main">
                  <span className="case-title">{c.title}</span>
                  <span className="case-question">{c.question}</span>
                </span>
                <span className="case-meta">
                  <span className="case-place">{c.place}</span>
                  <span className="case-vars">
                    {c.variables.slice(0, 4).map((v) => (
                      <span key={v} className="case-var">
                        <span className="case-swatch" style={{ background: rampCss(info(v).ramp) }} aria-hidden />
                        {info(v).shortName}
                      </span>
                    ))}
                  </span>
                </span>
                <ArrowRight className="case-arrow" size={20} strokeWidth={1.5} aria-hidden />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
