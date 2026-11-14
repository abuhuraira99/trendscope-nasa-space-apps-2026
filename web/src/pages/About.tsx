import { Link } from "react-router-dom";
import "../styles/page.css";
import "./about.css";

const TEAM = [
  { name: "Abu Huraira", role: "Team lead. Statistics, data pipeline and the app" },
  { name: "Hafiz Muhammad Haris", role: "Repository, documentation and deployment" },
  { name: "Muhammad Zawar Khan", role: "NASA data access" },
  { name: "Sania Shafiq", role: "Interface research and plain-language content" },
  { name: "Muhammad Mohsin", role: "Media and communication" },
];

export default function About() {
  return (
    <main id="main" className="page">
      <div className="page-wrap">
        <header className="page-head">
          <h1>Built for the Earth system trend detective</h1>
          <p className="page-lede">
            TrendScope is team TrendScope's answer to the NASA Space Apps Challenge 2026 challenge "Be An Earth System Trend Detective!".
            It helps anyone find variables that are changing, see where and how fast, and test whether the change is statistically real.
          </p>
        </header>

        <section className="page-section" aria-labelledby="what-h">
          <header>
            <h2 id="what-h">What it does</h2>
          </header>
          <div className="prose">
            <p>
              The challenge asks for a tool that selects Earth science variables, visualizes how they change, and determines what is
              changing, where, by how much, and whether the change is significant. TrendScope does each of those at global scale: 19 NASA
              variables, mapped and tested at every cell of a 1 degree grid, most of them from 1981 to 2025.
            </p>
            <p>
              Click any place and the investigation panel runs the full analysis in your browser: a Sen trend with its 95% range, a
              Mann-Kendall test corrected for year-to-year memory, a seasonal fingerprint from live NASA POWER data, a change-point test,
              the number of years a trend needs before it can be detected, a second opinion from an independent NASA record, and a scan of
              everything else changing at that place. The <Link to="/cases">case files</Link> walk through six real investigations, and
              the <Link to="/method">method page</Link> explains every test in plain language and in full detail.
            </p>
          </div>
        </section>

        <section className="page-section" aria-labelledby="team-h">
          <header>
            <h2 id="team-h">Team TrendScope</h2>
            <p>Multan local event, Pakistan. NASA Space Apps Challenge 2026.</p>
          </header>
          <ul className="team">
            {TEAM.map((t) => (
              <li key={t.name}>
                <strong>{t.name}</strong>
                <span>{t.role}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="page-section" aria-labelledby="built-h">
          <header>
            <h2 id="built-h">How it is built</h2>
          </header>
          <div className="prose">
            <p>
              A Python pipeline reads NASA POWER's analysis-ready archive on AWS Open Data (MERRA-2 and CERES SYN1deg), NASA GISS
              GISTEMP v4 and GPCP v2.3, computes annual series for every grid cell, and runs the trend tests with false discovery rate
              control across each map. The web app is written in TypeScript with React and a custom WebGL globe, and repeats the same tests
              in the browser so the map and the click-through verdict agree. It is hosted on Cloudflare Pages and the code is open on{" "}
              <a href="https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026">GitHub</a> under the MIT licence.
            </p>
            <p className="si-note">
              Some components of TrendScope were built with help from an AI coding agent. The team chose the methods and data, and checked
              the statistics against published reference implementations and the results against NASA records.
            </p>
          </div>
        </section>

        <section className="page-section" aria-labelledby="cite-h">
          <header>
            <h2 id="cite-h">Cite TrendScope</h2>
          </header>
          <div className="prose">
            <p className="mono-block">
              Team TrendScope (2026). TrendScope: a global atlas of significant trends in NASA Earth data. NASA Space Apps Challenge 2026.
              https://trendscope-earth.pages.dev
            </p>
            <p style={{ marginTop: 16, fontSize: "var(--t-14)", color: "var(--ink-3)" }}>
              TrendScope is a hackathon project and is not endorsed by NASA.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
