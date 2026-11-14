import { Link } from "react-router-dom";
import "../styles/page.css";
import "./demo.css";

export default function Demo() {
  return (
    <main id="main" className="page">
      <div className="page-wrap">
        <header className="page-head">
          <h1>TrendScope in 30 seconds</h1>
          <p className="page-lede">
            The project demo for the NASA Space Apps Challenge 2026, team TrendScope. Then try it yourself: open the{" "}
            <Link to="/">atlas</Link> and click any place on Earth.
          </p>
        </header>
        <div className="demo-frame">
          <video
            src="/demo/trendscope-demo.mp4"
            poster="/og.jpg"
            controls
            playsInline
            preload="metadata"
            aria-label="TrendScope demo video, 30 seconds, with English captions"
          />
        </div>
        <p className="demo-credits">
          Made with SI assistance. Music and footage credits are listed in the{" "}
          <a href="https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026/tree/main/video">video source</a>.
        </p>
      </div>
    </main>
  );
}
