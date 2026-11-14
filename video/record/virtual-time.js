// Injected into the live app before any of its own scripts run.
//
// It replaces the page clock with a virtual one so that every recorded frame is exactly 1/30 s
// apart, however slowly the CI machine renders WebGL. requestAnimationFrame callbacks only run
// when the recorder calls window.__vt.step(), performance.now() returns virtual time, and CSS
// transitions are seeked to the virtual clock (the recorder also freezes the document timeline
// through the DevTools protocol). Network, timers and React keep running in real time, which is
// what lets data load between frames.
//
// It also draws a small pointer that follows the (otherwise invisible) Playwright mouse.
(() => {
  if (window.__vt) return;

  const realRAF = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let vt = realNow();
  let queue = new Map();
  let nextId = 1;

  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    queue.delete(id);
  };
  performance.now = () => vt;

  const born = new WeakMap();

  function seekAnimations(birth) {
    for (const a of document.getAnimations()) {
      let b = born.get(a);
      if (b === undefined) {
        b = birth;
        born.set(a, b);
      }
      const t = Math.max(0, vt - b);
      let end = Infinity;
      try {
        end = a.effect ? a.effect.getComputedTiming().endTime : Infinity;
      } catch {
        /* ignore */
      }
      try {
        if (Number.isFinite(end) && t >= end) a.finish();
        else a.currentTime = t;
      } catch {
        /* ignore */
      }
    }
  }

  const realFrame = () => new Promise((r) => realRAF(() => r()));
  const macrotask = () => new Promise((r) => setTimeout(r, 0));

  function probeCanvas() {
    const c = document.querySelector(".stage-globe canvas") || document.querySelector("canvas");
    if (!c) return { ok: false, reason: "no canvas" };
    const w = 120;
    const h = 68;
    const s = document.createElement("canvas");
    s.width = w;
    s.height = h;
    const g = s.getContext("2d", { willReadFrequently: true });
    try {
      g.drawImage(c, 0, 0, w, h);
    } catch (e) {
      return { ok: false, reason: String(e) };
    }
    const d = g.getImageData(0, 0, w, h).data;
    let lit = 0;
    let colored = 0;
    for (let i = 0; i < d.length; i += 4) {
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      if (d[i + 3] > 0 && mx > 36) lit++;
      if (d[i + 3] > 0 && mx - mn > 36) colored++;
    }
    return { ok: true, lit: lit / (w * h), colored: colored / (w * h), cw: c.width, ch: c.height };
  }

  window.__vt = {
    now: () => vt,
    pending: () => queue.size,
    /** Advance the virtual clock by ms and run one animation frame. */
    async step(ms, opts = {}) {
      const before = vt;
      vt += ms;
      seekAnimations(before);
      // Let style, layout and ResizeObserver settle in a real frame before the app renders.
      await realFrame();
      await macrotask();
      const cbs = [...queue.values()];
      queue = new Map();
      for (const cb of cbs) {
        try {
          cb(vt);
        } catch (e) {
          console.error(e);
        }
      }
      seekAnimations(vt);
      return opts.probe ? probeCanvas() : null;
    },
    probe: probeCanvas,
  };

  // Pointer overlay: Playwright moves an invisible mouse, so draw one the viewer can follow.
  const install = () => {
    if (document.getElementById("__vt-cursor")) return;
    const el = document.createElement("div");
    el.id = "__vt-cursor";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML =
      '<svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 2 L2 22.5 L7.4 17.6 L11 25.6 L14.6 24 L11.1 16.2 L18.4 16.2 Z" ' +
      'fill="#ECE8E1" stroke="#0B0D10" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(el.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      opacity: "0",
      transformOrigin: "2px 2px",
      filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.45))",
      willChange: "transform",
    });
    document.documentElement.appendChild(el);
    let x = 0;
    let y = 0;
    let pressed = false;
    const place = () => {
      el.style.transform = `translate(${x - 2}px, ${y - 2}px) scale(${pressed ? 0.86 : 1})`;
    };
    window.addEventListener(
      "mousemove",
      (e) => {
        x = e.clientX;
        y = e.clientY;
        el.style.opacity = "1";
        place();
      },
      true,
    );
    window.addEventListener(
      "mousedown",
      () => {
        pressed = true;
        place();
      },
      true,
    );
    window.addEventListener(
      "mouseup",
      () => {
        pressed = false;
        place();
      },
      true,
    );
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
})();
