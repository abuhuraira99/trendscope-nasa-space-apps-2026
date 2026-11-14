import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Search, MapPin } from "lucide-react";
import { searchPlaces, type PlaceHit } from "../lib/geocode";
import "./search.css";

export default function SearchBox({
  onSelect,
  inputRef,
  placeholder = "Search a city, region or coordinates",
}: {
  onSelect: (hit: PlaceHit) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const listId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    setBusy(true);
    const t = window.setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((h) => {
          setHits(h);
          setActive(0);
          setOpen(true);
        })
        .catch(() => {})
        .finally(() => setBusy(false));
    }, 220);
    return () => {
      ctrl.abort();
      window.clearTimeout(t);
    };
  }, [q]);

  const choose = (h: PlaceHit) => {
    onSelect(h);
    setOpen(false);
    setQ(h.name);
    ref.current?.blur();
  };

  return (
    <div className="search" role="search">
      <Search className="search-icon" size={16} strokeWidth={1.75} aria-hidden />
      <input
        ref={ref}
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label="Search for a place"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && hits.length > 0}
        role="combobox"
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !hits.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {busy && <span className="search-busy" aria-hidden />}
      {open && hits.length > 0 && (
        <ul className="search-list" id={listId} role="listbox">
          {hits.map((h, i) => (
            <li
              key={`${h.lat},${h.lon},${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <MapPin size={14} strokeWidth={1.75} aria-hidden />
              <span className="search-name">{h.name}</span>
              <span className="search-detail">{h.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
