// Hero regression checks, against a running server (`npm run build && npm start`).
//
//   HERO_URL=http://localhost:3000 npm run test:hero
//
// Drives the real WebGL scene in Chrome (CHROME_PATH, or the default macOS
// install) and reads transforms off it through the `?hero-debug` hook:
//   1. renderer init: the scene reveals, the loader clears, no page errors;
//   2. cargo: once loaded (p >= 0.53) every crate sits inside the trailer
//      body until the yard unload, is only ever between trailer and quay
//      while both doors are fully open, and is on the quay stack once
//      unloaded; the doors are shut at the end. Checked every frame while
//      scrolling forward and back;
//   3. grounding: every hero wheel touches the ground, every frame;
//   4. stage sync: at rest in each stage the marker, the lit index and the
//      scene's own progress agree, and the copy is fully opaque;
//   5. fallback: with WebGL disabled there is no canvas, no stuck loader and
//      the copy still renders.
import { chromium } from "playwright-core";

const URL = process.env.HERO_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Mirrors STAGE_AT in components/home/HomeHero.tsx.
const STAGE_AT = [0, 0.583, 0.67, 0.82];
const stageOf = (p) => STAGE_AT.filter((s) => p >= s).length - 1;
// Mirror the yard epilogue in components/home/HeroScene.tsx.
const UNLOAD_A = 0.9735;
const UNLOAD_B = 0.9905;
const DOORS_SHUT = 0.9995;

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

async function open(args, viewport) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return { browser, page, errors };
}

/** Installs a per-frame sampler in the page; returns its violations on stop. */
const SAMPLER = ([UNLOAD_A, UNLOAD_B, DOORS_SHUT]) => {
  const scene = window.__hero.scene;
  const doors = scene.getObjectByName("hero-doors");
  const truck = scene.getObjectByName("hero-truck");
  const cargo = scene.getObjectByName("hero-cargo");
  const wheels = scene.getObjectByName("hero-wheels");
  const V = truck.position.constructor;
  const v = new V();
  const out = { frames: 0, cargo: [], ground: [], doors: [], maxP: 0 };
  // Trailer interior (truck-local), shrunk by a crate's half-size (0.575).
  const IN = { x: [-0.72, 0.72], y: [1.6, 3.4], z: [-4.42, 1.72] };
  const inside = (q) =>
    q.x >= IN.x[0] && q.x <= IN.x[1] && q.y >= IN.y[0] && q.y <= IN.y[1] && q.z >= IN.z[0] && q.z <= IN.z[1];
  const tick = () => {
    if (!window.__heroSampling) return;
    out.frames++;
    const p = scene.userData.progress ?? 0;
    out.maxP = Math.max(out.maxP, p);
    const open = Math.min(...doors.children.map((d) => Math.abs(d.rotation.y)));
    const at = (q) => `(${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)})`;
    if (p >= 0.53) {
      for (const crate of cargo.children) {
        truck.worldToLocal(crate.getWorldPosition(v));
        // Quay stack: past the doors' swing, resting on the slab or a crate.
        const quay = v.z < -7.9 && (Math.abs(v.y - 0.545) < 0.02 || Math.abs(v.y - 1.595) < 0.02);
        const bad =
          p <= UNLOAD_A ? !inside(v) : p >= UNLOAD_B ? !quay : !inside(v) && !quay && open < 1.99;
        if (bad && out.cargo.length < 5) out.cargo.push(`p=${p.toFixed(4)} crate at ${at(v)}, doors ${open.toFixed(2)}`);
      }
    }
    if (p >= DOORS_SHUT && open > 1e-3 && out.doors.length < 5)
      out.doors.push(`p=${p.toFixed(4)} doors still ${open.toFixed(3)} rad open`);
    for (const w of wheels.children) {
      w.getWorldPosition(v);
      if (Math.abs(v.y - 0.53) > 0.06 && out.ground.length < 5)
        out.ground.push(`p=${p.toFixed(3)} wheel centre y=${v.y.toFixed(3)}`);
    }
    requestAnimationFrame(tick);
  };
  window.__heroSampling = true;
  window.__heroSamples = out;
  requestAnimationFrame(tick);
};

const domState = (page) =>
  page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const ticks = [...document.querySelectorAll("section .font-mono.text-\\[10px\\]")].map(
      (el) => +getComputedStyle(el.parentElement).opacity,
    );
    return {
      marker: +h1.previousElementSibling.textContent.slice(0, 2) - 1,
      lit: ticks.indexOf(Math.max(...ticks)),
      opacity: +getComputedStyle(h1.parentElement).opacity,
      p: window.__hero.scene.userData.progress ?? 0,
    };
  });

const scrollTo = (page, p) =>
  page.evaluate((p) => {
    const s = document.querySelector("section");
    window.scrollTo(0, s.offsetTop + p * 0.85 * (s.offsetHeight - innerHeight));
  }, p);

async function sceneRun(viewport, label) {
  const { browser, page, errors } = await open(
    ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
    viewport,
  );
  await page.goto(`${URL}/?hero-debug`, { waitUntil: "networkidle" });
  const revealed = await page
    .waitForFunction(
      () => {
        const c = document.querySelector("section canvas");
        let o = 1;
        for (let el = c; el && el.tagName !== "SECTION"; el = el.parentElement) o *= +getComputedStyle(el).opacity;
        return !!(window.__hero && c && o > 0.99);
      },
      null,
      { timeout: 20000 },
    )
    .then(() => true, () => false);
  check(revealed, `${label}: renderer initialises and the scene is revealed`);
  if (!revealed) return browser.close();
  check(!(await page.$('[role="status"]')), `${label}: loading indicator cleared`);

  // Forward then reverse with the wheel, sampling every rendered frame.
  await page.evaluate(SAMPLER, [UNLOAD_A, UNLOAD_B, DOORS_SHUT]);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (const dir of [1, -1]) {
    // Until the scroll is past the end of the story (or back at the top),
    // however long the runway is.
    for (let k = 0; k < 400; k++) {
      const u = await page.evaluate(() => {
        const s = document.querySelector("section");
        return (scrollY - s.offsetTop) / (0.85 * (s.offsetHeight - innerHeight));
      });
      if (dir > 0 ? u >= 1 : u <= 0) break;
      await page.mouse.wheel(0, dir * 160);
      await page.waitForTimeout(50);
    }
    // Long enough for the paced story to finish the yard epilogue.
    await page.waitForTimeout(9000);
  }
  const s = await page.evaluate(() => {
    window.__heroSampling = false;
    return window.__heroSamples;
  });
  check(s.frames > 200, `${label}: sampled ${s.frames} frames across forward + reverse scroll`);
  check(s.cargo.length === 0, `${label}: cargo stays aboard until the yard, leaves only through open doors, ends on the quay${s.cargo.length ? " — " + s.cargo.join("; ") : ""}`);
  check(s.maxP > 0.9999, `${label}: the story reached its final frame (p=${s.maxP.toFixed(4)})`);
  check(s.doors.length === 0, `${label}: doors fully shut at the end${s.doors.length ? " — " + s.doors.join("; ") : ""}`);
  check(s.ground.length === 0, `${label}: wheels stay on the ground${s.ground.length ? " — " + s.ground.join("; ") : ""}`);

  // At rest in each stage, both directions.
  // Scroll shares, one inside each stage (lib/pace story()), and the end.
  for (const p of [0.17, 0.4, 0.56, 0.72, 1, 0.72, 0.56, 0.4, 0.17]) {
    await scrollTo(page, p);
    await page.waitForTimeout(p === 1 ? 9000 : 3500);
    const d = await domState(page);
    if (p === 1) {
      const end = await page.evaluate(() => {
        const sc = window.__hero.scene;
        return {
          doors: Math.max(...sc.getObjectByName("hero-doors").children.map((d) => Math.abs(d.rotation.y))),
          z: Math.max(...sc.getObjectByName("hero-cargo").children.map((c) => {
            const t = sc.getObjectByName("hero-truck");
            return t.worldToLocal(c.getWorldPosition(c.position.clone())).z;
          })),
        };
      });
      check(
        end.doors < 1e-3 && end.z < -7.9,
        `${label}: final frame — doors shut (${end.doors.toFixed(4)} rad), cargo on the quay (nearest z ${end.z.toFixed(2)})`,
      );
    }
    const want = stageOf(d.p);
    check(
      d.marker === want && d.lit === want && d.opacity > 0.99,
      `${label}: at p=${d.p.toFixed(3)} marker ${d.marker + 1}, index ${d.lit + 1}, scene stage ${want + 1}, copy opacity ${d.opacity.toFixed(2)}`,
    );
  }
  check(errors.length === 0, `${label}: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
  await browser.close();
}

async function fallbackRun() {
  const { browser, page, errors } = await open(["--disable-webgl", "--disable-3d-apis"], {
    width: 1440,
    height: 900,
  });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(6000);
  check(!(await page.$("section canvas")), "no-WebGL: no canvas is mounted");
  check(!(await page.$('[role="status"]')), "no-WebGL: no loading indicator left spinning");
  check(!!(await page.$("section h1")), "no-WebGL: hero copy still renders over the poster");
  check(errors.length === 0, `no-WebGL: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
  await browser.close();
}

await sceneRun({ width: 1440, height: 900 }, "desktop");
await sceneRun({ width: 390, height: 844 }, "mobile");
await fallbackRun();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall hero checks passed");
process.exit(failures.length ? 1 : 0);
