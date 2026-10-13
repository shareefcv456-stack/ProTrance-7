// Hero regression checks, against a running server (`npm run build && npm start`).
//
//   HERO_URL=http://localhost:3000 npm run test:hero
//
// Drives the real WebGL scene in Chrome (CHROME_PATH, or the default macOS
// install) and reads transforms off it through the `?hero-debug` hook:
//   1. renderer init: the scene reveals, the loader clears, no page errors;
//   2. cargo: once loaded (p >= 0.53) every crate sits inside the trailer
//      body, checked every frame while scrolling forward and back;
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
const SAMPLER = () => {
  const scene = window.__hero.scene;
  const truck = scene.getObjectByName("hero-truck");
  const cargo = scene.getObjectByName("hero-cargo");
  const wheels = scene.getObjectByName("hero-wheels");
  const V = truck.position.constructor;
  const v = new V();
  const out = { frames: 0, cargo: [], ground: [] };
  // Trailer interior (truck-local), shrunk by a crate's half-size (0.575).
  const IN = { x: [-0.72, 0.72], y: [1.6, 3.4], z: [-4.42, 1.72] };
  const inside = (q) =>
    q.x >= IN.x[0] && q.x <= IN.x[1] && q.y >= IN.y[0] && q.y <= IN.y[1] && q.z >= IN.z[0] && q.z <= IN.z[1];
  const tick = () => {
    if (!window.__heroSampling) return;
    out.frames++;
    const p = scene.userData.progress ?? 0;
    if (p >= 0.53) {
      for (const crate of cargo.children) {
        truck.worldToLocal(crate.getWorldPosition(v));
        if (!inside(v) && out.cargo.length < 5)
          out.cargo.push(`p=${p.toFixed(3)} crate at (${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`);
      }
    }
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
  await page.evaluate(SAMPLER);
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  for (const dir of [1, -1]) {
    for (let k = 0; k < 60; k++) {
      await page.mouse.wheel(0, dir * 160);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(2500);
  }
  const s = await page.evaluate(() => {
    window.__heroSampling = false;
    return window.__heroSamples;
  });
  check(s.frames > 200, `${label}: sampled ${s.frames} frames across forward + reverse scroll`);
  check(s.cargo.length === 0, `${label}: cargo stays inside the trailer${s.cargo.length ? " — " + s.cargo.join("; ") : ""}`);
  check(s.ground.length === 0, `${label}: wheels stay on the ground${s.ground.length ? " — " + s.ground.join("; ") : ""}`);

  // At rest in each stage, both directions.
  for (const p of [0.3, 0.63, 0.75, 0.95, 0.75, 0.63, 0.3]) {
    await scrollTo(page, p);
    await page.waitForTimeout(3500);
    const d = await domState(page);
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
