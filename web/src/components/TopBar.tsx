import { NavLink, Link } from "react-router-dom";
import "./topbar.css";

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 2.75c-2.6 2.5-3.9 5.6-3.9 9.25s1.3 6.75 3.9 9.25" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
      <path d="M3.5 15.2 8.4 12l3.4 1.9 4.4-5.6 4.9-1.6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16.2" cy="8.3" r="1.6" fill="currentColor" />
    </svg>
  );
}

export default function TopBar() {
  return (
    <header className="topbar">
      <Link to="/" className="brand" aria-label="TrendScope home">
        <Mark />
        <span>TrendScope</span>
      </Link>
      <nav aria-label="Main">
        <NavLink to="/" end>
          Atlas
        </NavLink>
        <NavLink to="/cases">Case files</NavLink>
        <NavLink to="/method">Method</NavLink>
        <NavLink to="/data">Data</NavLink>
        <NavLink to="/about">About</NavLink>
      </nav>
      <a className="topbar-repo" href="https://github.com/abuhuraira99/trendscope-nasa-space-apps-2026" target="_blank" rel="noreferrer">
        Source code
      </a>
    </header>
  );
}
