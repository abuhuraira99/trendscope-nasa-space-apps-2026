/**
 * Turns a plain question ("Is Lahore getting more humid?") into variables and a place.
 * The server route asks a small Workers AI model; a keyword reader runs in the browser as well,
 * and covers for the model whenever it is unavailable. Neither produces numbers.
 */

export interface AskResult {
  variables: string[];
  place: string | null;
  via: "model" | "keywords";
  reason?: string;
}

const KEYWORDS: [RegExp, string][] = [
  [/\b(humid|humidity|muggy|sticky|wet[- ]?bulb|heat stress|heat index)\b/i, "t2mwet"],
  [/\b(air ?condition\w*|a\/?c|cooling (need|demand|degree))\b/i, "cdd"],
  [/\b(heat ?wave|daytime high|hottest|max(imum)? temp)\b/i, "t2m_max"],
  [/\b(hot|hotter|heat|warm\w*|temperature|cold\w*|cool\w*)\b/i, "t2m"],
  [/\b(rain\w*|precip\w*|monsoon|wetter|downpour|flood\w*)\b/i, "precip"],
  [/\b(drought|dry\w*|soil|moisture)\b/i, "soil"],
  [/\b(evapo\w*)\b/i, "evap"],
  [/\b(ground ?water|water (storage|table|stored)|aquifer)\b/i, "tws"],
  [/\b(water vapou?r|precipitable)\b/i, "pw"],
  [/\b(snow\w*)\b/i, "snow"],
  [/\b(sea ice|ice)\b/i, "seaice"],
  [/\b(ozone)\b/i, "ozone"],
  [/\b(smog|haze|hazy|aerosol\w*|pollut\w*|air quality|dust)\b/i, "aod"],
  [/\b(cloud\w*)\b/i, "cloud"],
  [/\b(sun\w*|solar|bright\w*|dimm\w*)\b/i, "solar"],
  [/\b(wind\w*)\b/i, "wind"],
  [/\b(green\w*|vegetation|plants?|forest\w*|crops?|brown\w*)\b/i, "ndvi"],
];

const STOP = new Set(
  "is are was were be been has have had do does did will would can could should the a an in at on of for to from over near around getting get becoming become more less much than and or it its there here my our your this that what where how why when which who really actually still since years year decade decades trend trends changing change changed".split(
    " ",
  ),
);

export function readKeywords(q: string, available: string[]): AskResult {
  const vars: string[] = [];
  let rest = q;
  for (const [re, id] of KEYWORDS) {
    if (re.test(rest) && available.includes(id) && !vars.includes(id)) vars.push(id);
    rest = rest.replace(new RegExp(re.source, "gi"), " ");
  }
  const words = rest
    .replace(/[?!.,;:]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
  return { variables: vars.slice(0, 3), place: words.length ? words.join(" ") : null, via: "keywords" };
}

export async function askQuestion(q: string, vars: { id: string; name: string }[]): Promise<AskResult> {
  const local = readKeywords(
    q,
    vars.map((v) => v.id),
  );
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 7000);
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q, vars }),
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    if (!res.ok) return local;
    const j = (await res.json()) as { place?: string | null; variables?: string[]; reason?: string };
    const variables = j.variables?.length ? j.variables : local.variables;
    return { variables, place: j.place ?? local.place, via: "model", reason: j.reason };
  } catch {
    return local;
  }
}

export function looksLikeQuestion(q: string): boolean {
  const t = q.trim();
  if (t.includes("?")) return true;
  if (/^(is|are|has|have|does|do|did|how|what|where|why|will|which|show|find)\b/i.test(t)) return true;
  return KEYWORDS.some(([re]) => re.test(t)) && t.split(/\s+/).length >= 2;
}
