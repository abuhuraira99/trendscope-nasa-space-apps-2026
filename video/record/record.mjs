// Records frame-exact footage of the live TrendScope app for the demo video.
//
// The page clock is virtualised (see virtual-time.js), so each saved frame is exactly 1/30 s of
// app time apart even though software WebGL on a CI runner renders far slower than real time.
// Output: public/footage/<clip>/NNNN.jpg plus public/footage/manifest.json, which is passed to
// Remotion as input props.
//
// Usage: node record/record.mjs            (records both clips)
//        CLIPS=app node record/record.mjs  (one clip)
//        SITE_URL=https://... node record/record.mjs
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "..");
const OUT = path.join(ROOT, "public", "footage");
const SITE = (process.env.SITE_URL ?? "https://trendscope-earth.pages.dev").replace(/\/$/, "");
const timeline = JSON.parse(await fs.readFile(path.join(ROOT, "timeline.json"), "utf8"));
const FPS = timeline.fps;
const DT = 1000 / FPS;
const ONLY = process.env.CLIPS ? process.env.CLIPS.split(",") : null;
const VIRTUAL_TIME = await fs.readFile(path.join(here, "virtual-time.js"), "utf8");

const log = (...a) => console.log(`[record ${new Date().toISOString().slice(11, 19)}]`, ...a);

// ---------------------------------------------------------------------------------------------
// Easing
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ---------------------------------------------------------------------------------------------
// Browser
async function launch() {
  return chromium.launch({
    headless: true,
    args: [
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
    ],
  });
}

class Recorder {
  constructor(page, cdp, dir) {
    this.page = page;
    this.cdp = cdp;
    this.dir = dir;
    this.frame = 0;
    this.mouse = { x: 0, y: 0 };
    this.marks = {};
  }

  get t() {
    return this.frame / FPS;
  }

  async step() {
    await this.page.evaluate((dt) => window.__vt.step(dt), DT);
  }

  /** Advance one frame of app time and save it. */
  async capture() {
    await this.step();
    const { data } = await this.cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 92,
      fromSurface: true,
      captureBeyondViewport: false,
    });
    const file = path.join(this.dir, `${String(this.frame).padStart(4, "0")}.jpg`);
    await fs.writeFile(file, Buffer.from(data, "base64"));
    this.frame++;
    if (this.frame % 30 === 0) log(`${path.basename(this.dir)}: ${this.frame} frames (${this.t.toFixed(1)} s)`);
  }

  async holdUntil(t) {
    while (this.t < t - 1e-6) await this.capture();
  }

  async hold(seconds) {
    await this.holdUntil(this.t + seconds);
  }

  async moveInstant(x, y) {
    this.mouse = { x, y };
    await this.page.mouse.move(x, y);
  }

  /** Glide the pointer to (x, y) over `seconds`, with a slight arc, capturing every frame. */
  async glide(x, y, seconds) {
    const from = { ...this.mouse };
    const n = Math.max(1, Math.round(seconds * FPS));
    const dx = x - from.x;
    const dy = y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(60, len * 0.08);
    for (let i = 1; i <= n; i++) {
      const k = easeInOut(i / n);
      const arc = Math.sin(Math.PI * k) * bow;
      const px = from.x + dx * k + (-dy / len) * arc;
      const py = from.y + dy * k + (dx / len) * arc;
      this.mouse = { x: px, y: py };
      await this.page.mouse.move(px, py);
      await this.capture();
    }
  }

  async click() {
    await this.page.mouse.down();
    await this.capture();
    await this.capture();
    await this.page.mouse.up();
  }

  async scrollTo(selector, top, seconds) {
    const start = await this.page.$eval(selector, (el) => el.scrollTop);
    const n = Math.max(1, Math.round(seconds * FPS));
    for (let i = 1; i <= n; i++) {
      const v = start + (top - start) * easeInOut(i / n);
      await this.page.$eval(selector, (el, v) => el.scrollTo({ top: v, behavior: "instant" }), v);
      await this.capture();
    }
  }
}

async function newPage(browser, { dsf, hideUi }) {
  const context = await browser.newContext({
    viewport: { width: timeline.width, height: timeline.height },
    deviceScaleFactor: dsf,
    colorScheme: "dark",
    reducedMotion: "no-preference",
    locale: "en-US",
    timezoneId: "Asia/Karachi",
  });
  await context.addInitScript({ content: VIRTUAL_TIME });
  if (hideUi) {
    await context.addInitScript({
      content: `(() => {
        const css = \`
          .topbar, .rail, .stage-search, .stage-tools, .legend, .ruler, .readout, .stage-hint,
          .skip-link, .inspector, #__vt-cursor { display: none !important; }
          .atlas { grid-template-columns: 1fr !important; height: 100vh !important; }
        \`;
        const add = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
        if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
      })();`,
    });
  }
  const page = await context.newPage();
  page.on("pageerror", (e) => log("page error:", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") log("console error:", m.text().slice(0, 200));
  });
  // Show the search suggestions only for the finished word, so the list does not flicker through
  // results for "La", "Lah" and so on while the name is typed frame by frame.
  await page.route(/geocoding-api\.open-meteo\.com/, async (route) => {
    const name = new URL(route.request().url()).searchParams.get("name") ?? "";
    if (name.trim().toLowerCase() !== "lahore") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.continue();
  });
  const cdp = await context.newCDPSession(page);
  return { context, page, cdp };
}

async function freezeCssTimeline(cdp) {
  try {
    await cdp.send("Animation.enable");
    await cdp.send("Animation.setPlaybackRate", { playbackRate: 0 });
  } catch (e) {
    log("could not freeze the CSS timeline, transitions will use real time:", e.message);
  }
}

/** Step the app clock until the globe has rendered data, then a little longer. Fails on a blank globe. */
async function warmUp(page, label, extraFrames) {
  await page.waitForSelector(".stage-globe canvas", { state: "attached", timeout: 60_000 });
  await page.waitForFunction(() => document.querySelectorAll("button.var-row").length > 0, null, {
    timeout: 60_000,
    polling: 200,
  });
  let probe = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    probe = await page.evaluate((dt) => window.__vt.step(dt, { probe: true }), DT);
    if (probe?.ok && probe.lit > 0.12 && probe.colored > 0.08) break;
    await page.waitForTimeout(100);
  }
  log(`${label}: globe probe`, JSON.stringify(probe));
  if (!probe?.ok || probe.lit < 0.12 || probe.colored < 0.08) {
    throw new Error(`${label}: the globe stayed blank (WebGL did not render data): ${JSON.stringify(probe)}`);
  }
  for (let i = 0; i < extraFrames; i++) await page.evaluate((dt) => window.__vt.step(dt), DT);
  const after = await page.evaluate(() => window.__vt.probe());
  log(`${label}: probe after warm-up`, JSON.stringify(after));
}

async function cleanDir(dir) {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
}

// ---------------------------------------------------------------------------------------------
// Clip 1: the globe alone (app UI hidden), used behind the title and the closing scene.
async function recordGlobe(browser) {
  const dir = path.join(OUT, "globe");
  await cleanDir(dir);
  const { context, page, cdp } = await newPage(browser, { dsf: 1, hideUi: true });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await freezeCssTimeline(cdp);
  // Show wet-bulb temperature (humid heat). The rail is hidden, so press its row from script;
  // the switch happens during warm-up, before any frame is saved.
  await page.waitForFunction(() => document.querySelectorAll("button.var-row").length > 0, null, {
    timeout: 60_000,
    polling: 200,
  });
  const globeVar = await page.evaluate((names) => {
    const rows = [...document.querySelectorAll("button.var-row")];
    for (const n of names) {
      const row = rows.find((b) => (b.querySelector(".var-name")?.textContent ?? b.innerText).trim() === n);
      if (row) {
        row.click();
        return n;
      }
    }
    return null;
  }, ["Wet-bulb temperature"]);
  log("globe variable:", globeVar ?? "default");
  // 4.6 s of app time so the idle spin is already turning when the clip starts.
  await warmUp(page, "globe", Math.round(4.6 * FPS));
  const rec = new Recorder(page, cdp, dir);
  await rec.holdUntil(timeline.globeClip.frames / FPS);
  await page.screenshot({ path: path.join(OUT, "check-globe.png") });
  await context.close();
  return { frames: rec.frame, dir: "footage/globe", variable: globeVar };
}

// ---------------------------------------------------------------------------------------------
// Clip 2: the app itself. Switch variables, apply the false discovery filter, search Lahore,
// read the verdict, then scroll to the scan of every other variable.
async function rowCenter(page, names) {
  for (const name of names) {
    const box = await page.evaluate((name) => {
      const rows = [...document.querySelectorAll("button.var-row")];
      const row = rows.find((b) => (b.querySelector(".var-name")?.textContent ?? b.innerText).trim() === name);
      if (!row) return null;
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
      const r = row.getBoundingClientRect();
      const label = row.querySelector(".var-name")?.getBoundingClientRect() ?? r;
      return { x: label.x + Math.min(label.width, 160) * 0.55, y: r.y + r.height / 2, name };
    }, name);
    if (box) return box;
  }
  return null;
}

async function boxOf(page, selector, pick) {
  return page.evaluate(
    ({ selector, pick }) => {
      const els = [...document.querySelectorAll(selector)];
      const el = pick ? els.find((e) => e.innerText.replace(/\s+/g, " ").includes(pick)) : els[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    },
    { selector, pick },
  );
}

async function recordApp(browser) {
  const dir = path.join(OUT, "app");
  await cleanDir(dir);
  const { context, page, cdp } = await newPage(browser, { dsf: 1.5, hideUi: false });
  await page.goto(`${SITE}/`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await freezeCssTimeline(cdp);
  await warmUp(page, "app", Math.round(4.4 * FPS));
  const rec = new Recorder(page, cdp, dir);
  const facts = {};

  // Pointer starts low on the globe, out of the way.
  await rec.moveInstant(1600, 830);
  await rec.hold(0.25);

  // 1. Switch variables (all on the same MERRA-2 grid, so the globe crossfades cleanly).
  const plan = [
    { names: ["Precipitable water", "Water vapour in the air", "Root-zone soil wetness"], clickAt: 1.1 },
    { names: ["Precipitation"], clickAt: 2.15 },
    { names: ["Wet-bulb temperature"], clickAt: 3.1, required: true },
  ];
  facts.variablesShown = [];
  for (const p of plan) {
    const box = await rowCenter(page, p.names);
    if (!box) {
      if (p.required) throw new Error(`variable row not found: ${p.names.join(" / ")}`);
      log("skipping missing variable", p.names.join(" / "));
      continue;
    }
    await rec.glide(box.x, box.y, Math.max(0.35, p.clickAt - rec.t - 0.12));
    await rec.holdUntil(p.clickAt - 0.07);
    await rec.click();
    facts.variablesShown.push(box.name);
  }

  // 2. Only show trends that pass the false discovery test.
  const sw =
    (await boxOf(page, ".sig-toggle .sig-switch")) ??
    (await boxOf(page, ".sig-toggle")) ??
    (await boxOf(page, ".rail input[type=checkbox]"));
  if (!sw) throw new Error("false discovery toggle not found");
  await rec.hold(0.3);
  await rec.glide(sw.x + sw.width / 2, sw.y + sw.height / 2, Math.max(0.4, 4.18 - rec.t));
  await rec.click();
  facts.sigOnly = await page.evaluate(() => document.querySelector(".sig-toggle input, .rail input[type=checkbox]")?.checked ?? null);

  // 3. Search for Lahore.
  const input = (await boxOf(page, ".stage-search input")) ?? (await boxOf(page, "input[type=search]"));
  if (!input) throw new Error("search box not found");
  await rec.hold(0.3);
  await rec.glide(input.x + 150, input.y + input.height / 2, Math.max(0.4, 5.23 - rec.t));
  await rec.click();
  await rec.holdUntil(5.45);
  for (const ch of "Lahore") {
    await page.keyboard.type(ch);
    await rec.capture();
    await rec.capture();
    await rec.capture();
  }
  await rec.holdUntil(6.15);
  const option = '.search-list li, [role="listbox"] [role="option"]';
  await page.waitForFunction(
    (sel) => [...document.querySelectorAll(sel)].some((li) => li.innerText.includes("Pakistan")),
    option,
    { timeout: 30_000, polling: 100 },
  );
  await rec.capture();
  const hit = await boxOf(page, option, "Pakistan");
  await rec.glide(hit.x + 120, hit.y + hit.height / 2, Math.max(0.35, 6.73 - rec.t));
  // The result is chosen on mousedown. App time stands still while the investigation loads, so
  // the panel opens already filled in: first the verdict, then the live NASA POWER monthly
  // series (optional; the panel works without it).
  await page.mouse.down();
  rec.marks.picked = rec.t;
  await page.waitForFunction(() => !!document.querySelector(".insp-big"), null, { timeout: 60_000, polling: 100 });
  try {
    await page.waitForFunction(
      () =>
        document.querySelectorAll(".scan-row").length > 0 &&
        ![...document.querySelectorAll(".scan-row")].some((r) => r.classList.contains("is-loading")) &&
        /faint trace|monthly/i.test(document.querySelector(".insp-caption")?.textContent ?? ""),
      null,
      { timeout: 45_000, polling: 250 },
    );
  } catch {
    log("live monthly series did not arrive in time; continuing without it");
  }
  facts.place = await page.evaluate(() => document.querySelector(".insp-head h2, .inspector h2")?.textContent?.trim() ?? null);
  facts.verdict = await page.evaluate(() => document.querySelector(".insp-big")?.innerText.replace(/\s+/g, " ").trim() ?? null);
  facts.headline = await page.evaluate(() => document.querySelector(".insp-head-line")?.innerText.trim() ?? null);
  const inspector = await boxOf(page, ".inspector");
  log("investigation:", JSON.stringify(facts));
  await rec.capture();
  await rec.capture();
  await page.mouse.up();

  facts.scan = await page.evaluate(() =>
    [...document.querySelectorAll(".scan-row")].map((r) => r.innerText.replace(/\s+/g, " ").trim()),
  );
  facts.evidence = await page.evaluate(() =>
    [...document.querySelectorAll(".stats > div")].slice(0, 4).map((r) => r.innerText.replace(/\s+/g, " ").trim()),
  );

  // 4. While the camera flies in, the pointer moves to the yearly chart, then scrubs along it:
  //    the app's hover line and readout show each year's value from 1981 to the latest year.
  const chart =
    (await boxOf(page, ".inspector .chart svg")) ?? (await boxOf(page, '.inspector svg[role="img"]'));
  if (chart) {
    const y = chart.y + chart.height * 0.5;
    const x0 = chart.x + chart.width * 0.1;
    const x1 = chart.x + chart.width * 0.965;
    await rec.glide(x0, y, 1.0);
    await rec.holdUntil(8.4);
    rec.marks.scrubStart = rec.t;
    const n = Math.round(2.2 * FPS);
    for (let i = 1; i <= n; i++) {
      const k = i / n;
      // Even speed in the middle, soft start and stop.
      const e = k < 0.15 ? (k * k) / 0.255 : k > 0.85 ? 1 - ((1 - k) * (1 - k)) / 0.255 : (k - 0.075) / 0.85;
      rec.mouse = { x: x0 + (x1 - x0) * e, y };
      await page.mouse.move(rec.mouse.x, y);
      await rec.capture();
    }
    rec.marks.scrubEnd = rec.t;
    facts.chartTip = await page.evaluate(() => document.querySelector(".chart-tip")?.innerText.replace(/\s+/g, " ").trim() ?? null);
  } else {
    log("chart not found; the pointer rests instead");
    await rec.glide(1330, 960, 0.8);
  }
  facts.chart = chart;
  await rec.holdUntil(timeline.appClip.frames / FPS);
  await page.screenshot({ path: path.join(OUT, "check-app.png") });
  await context.close();
  return { frames: rec.frame, dir: "footage/app", dsf: 1.5, inspector, marks: rec.marks, facts };
}

// ---------------------------------------------------------------------------------------------
async function siteFacts() {
  const res = await fetch(`${SITE}/data/vars.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(`vars.json: HTTP ${res.status}`);
  const v = await res.json();
  return {
    datasets: v.vars.length,
    years: v.period[1] - v.period[0] + 1,
    period: v.period,
    generated: v.generated ?? null,
  };
}

const started = Date.now();
await fs.mkdir(OUT, { recursive: true });
const manifestPath = path.join(OUT, "manifest.json");
let manifest = {};
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
} catch {
  /* first run */
}
manifest.site = SITE;
manifest.recordedAt = new Date().toISOString();
manifest.data = await siteFacts();
log("site data:", JSON.stringify(manifest.data));

const browser = await launch();
try {
  if (!ONLY || ONLY.includes("globe")) manifest.globe = await recordGlobe(browser);
  if (!ONLY || ONLY.includes("app")) manifest.app = await recordApp(browser);
} finally {
  await browser.close();
}
await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`, JSON.stringify({ globe: manifest.globe?.frames, app: manifest.app?.frames }));
