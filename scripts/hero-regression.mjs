// Hero regression checks, against a running server (`npm run build && npm start`).
//
//   HERO_URL=http://localhost:3000 npm run test:hero
//
// Drives the autoplaying hero video in Chrome (CHROME_PATH, or the default
// macOS install):
//   1. load: poster first, video autoplays muted inline, one download,
//      18s at 1280×720, no errors, no overflow or layout shift at any width;
//   2. playback: crosses the 9s join into the second clip and ends on the
//      final frame; no chapter rail, one fixed headline; the sound toggle
//      unmutes/mutes and replays a finished video with sound;
//   3. scroll: scrolling never pauses, seeks or reverses the video;
//   4. fallbacks: blocked autoplay and reduced motion show a play button
//      that works; a failed video keeps the poster.
import { chromium } from "playwright-core";

const URL = process.env.HERO_URL ?? "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// Mirror components/home/HomeHero.tsx.

const failures = [];
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failures.push(msg);
};

async function open(viewport, opts = {}, init) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport, ...opts });
  if (init) await page.addInitScript(init);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  let videoRequests = 0;
  page.on("request", (r) => r.url().includes("pro-hero.mp4") && videoRequests++);
  await page.goto(URL, { waitUntil: "load" });
  return { browser, page, errors, videoRequests: () => videoRequests };
}

const state = (page) =>
  page.evaluate(() => {
    const s = document.querySelector("section");
    const v = s.querySelector("video");
    const h1 = s.querySelector("h1");
    return {
      t: v.currentTime,
      paused: v.paused,
      ended: v.ended,
      duration: v.duration,
      w: v.videoWidth,
      h: v.videoHeight,
      muted: v.muted,
      inline: v.hasAttribute("playsinline"),
      shown: +getComputedStyle(v).opacity,
      // Each line once: StaggerText adds an sr-only copy beside its words.
      headline: [...h1.children].map((l) => (l.querySelector(".sr-only") ?? l).textContent.trim()).join(" "),
      chapters: /\b0[1-4]\b/.test(s.innerText),
      sound: s.querySelector('button[aria-pressed]')?.getAttribute("aria-label") ?? null,
      button: !!s.querySelector('button[aria-label="Play hero video"]'),
      cta: +getComputedStyle(s.querySelector('a[href="/contact"]').parentElement).opacity,
    };
  });

const playing = (page) =>
  page
    .waitForFunction(() => {
      const v = document.querySelector("section video");
      return v && !v.paused && v.currentTime > 0.2 && +getComputedStyle(v).opacity > 0.99;
    }, null, { timeout: 20000 })
    .then(() => true, () => false);

async function autoplayRun(viewport, label) {
  const { browser, page, errors, videoRequests } = await open(viewport, { hasTouch: viewport.width < 768, isMobile: viewport.width < 768 });
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => e.hadRecentInput || (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true });
  });
  const poster = await page.$eval("section img", (i) => i.complete && i.naturalWidth === 1280);
  check(poster, `${label}: poster (frame 0, 1280px) painted`);
  check(await playing(page), `${label}: video autoplays without any scroll or tap`);
  let s = await state(page);
  check(s.muted && s.inline && !s.button, `${label}: muted + playsinline, no play button needed`);
  check(Math.abs(s.duration - 18) < 0.05 && s.w === 1280 && s.h === 720, `${label}: ${s.duration}s at ${s.w}×${s.h}`);
  await page.waitForTimeout(1200); // the page-load reveal
  const cta = (await state(page)).cta;
  check(cta > 0.99, `${label}: CTAs visible while the video plays (opacity ${cta.toFixed(2)})`);

  // Scrolling has no hold on the video: it keeps playing at its own pace.
  s = await state(page);
  const t0 = s.t;
  const w0 = Date.now();
  if (viewport.width < 768) {
    const cdp = await page.context().newCDPSession(page);
    for (const dy of [-500, -500, 400, -300]) await cdp.send("Input.synthesizeScrollGesture", { x: 150, y: 500, yDistance: dy, gestureSourceType: "touch", speed: 1500 });
  } else {
    await page.mouse.move(700, 450);
    for (const dy of [600, 600, -400, 900, -1200]) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(120);
    }
  }
  s = await state(page);
  const elapsed = (Date.now() - w0) / 1000;
  check(!s.paused && Math.abs(s.t - t0 - elapsed) < 0.6, `${label}: scrolling does not pause or seek it (video moved ${(s.t - t0).toFixed(2)}s in ${elapsed.toFixed(2)}s)`);
  await page.evaluate(() => scrollTo(0, 0));

  // Through the 9s join to the end. Jump to just before the join and let it
  // play across — the join must be continuous playback, not a stall.
  await page.$eval("section video", (v) => (v.currentTime = 8.5));
  await page.waitForFunction(() => document.querySelector("section video").currentTime > 9.4, null, { timeout: 5000 }).catch(() => {});
  s = await state(page);
  check(s.t > 9.4 && !s.paused && s.shown > 0.99, `${label}: plays across the 9s join into the second clip (t=${s.t.toFixed(2)})`);
  check(!s.chapters && s.headline === "Logistics that keep retail moving.", `${label}: no 01–04 chapter rail, fixed headline ("${s.headline}")`);

  // Sound toggle: off by default, on and off again by the visitor's tap.
  check(s.muted && s.sound === "Turn sound on", `${label}: starts muted with a sound toggle (${s.sound})`);
  await page.click("section button[aria-pressed]");
  await page.waitForTimeout(300);
  s = await state(page);
  check(!s.muted && !s.paused && s.sound === "Turn sound off", `${label}: toggle turns sound on, keeps playing (muted ${s.muted})`);
  await page.click("section button[aria-pressed]");
  await page.waitForTimeout(300);
  s = await state(page);
  check(s.muted && !s.paused && s.sound === "Turn sound on", `${label}: toggle turns sound off again (muted ${s.muted})`);

  await page.$eval("section video", (v) => (v.currentTime = 16.2));
  await page.waitForFunction(() => document.querySelector("section video").ended, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(600);
  s = await state(page);
  check(s.ended && s.paused && s.t > 17.9 && s.shown > 0.99, `${label}: ends and holds the final frame (t=${s.t.toFixed(2)})`);
  await page.click("section button[aria-pressed]");
  await page.waitForTimeout(600);
  s = await state(page);
  check(!s.muted && !s.paused && s.t < 2, `${label}: sound on after the end replays from the start with sound (t=${s.t.toFixed(2)})`);

  check(videoRequests() >= 1 && (await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.name.includes("pro-hero.mp4")).length)) <= 1, `${label}: video fetched by one element only`);
  const cls = await page.evaluate(() => window.__cls);
  check(cls < 0.1, `${label}: no layout shift (CLS ${cls.toFixed(4)})`);
  check(errors.length === 0, `${label}: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
  await browser.close();
}

async function widthRuns() {
  for (const width of [320, 360, 375, 390, 414, 430, 1440]) {
    const { browser, page, errors } = await open({ width, height: width < 768 ? 800 : 900 }, { hasTouch: width < 768 });
    const ok = await playing(page);
    const r = await page.evaluate(() => {
      const cta = document.querySelector('section a[href="/services"]').getBoundingClientRect();
      const v = document.querySelector("section video").getBoundingClientRect();
      return { sw: document.documentElement.scrollWidth, cta: cta.right <= innerWidth && cta.bottom <= innerHeight, vw: v.width };
    });
    check(ok && r.sw <= width && r.cta && r.vw === width && errors.length === 0, `${width}px: plays, no overflow (scrollWidth ${r.sw}), video full width, CTAs on screen, ${errors.length} errors`);
    await browser.close();
  }
}

async function fallbackRuns() {
  // Autoplay refused (as a strict browser or Low Power Mode would).
  {
    const { browser, page, errors } = await open({ width: 390, height: 844 }, {}, () => {
      const real = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (!window.__tapped) return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        return real.call(this);
      };
      addEventListener("pointerdown", () => (window.__tapped = true), true);
    });
    await page.waitForTimeout(1500);
    let s = await state(page);
    check(s.button && s.paused && s.t === 0, "autoplay blocked: play button shown over the poster");
    await page.click('button[aria-label="Play hero video"]');
    check(await playing(page), "autoplay blocked: tapping play starts the video");
    s = await state(page);
    check(!s.button, "autoplay blocked: play button gone once playing");
    check(errors.length === 0, `autoplay blocked: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
    await browser.close();
  }
  // Reduced motion: nothing moves, nothing downloads, until asked.
  {
    const { browser, page, errors, videoRequests } = await open({ width: 1440, height: 900 }, { reducedMotion: "reduce" });
    await page.waitForTimeout(1500);
    const s = await state(page);
    check(s.paused && s.button, "reduced motion: no autoplay, play button offered");
    check(videoRequests() === 0, `reduced motion: video not downloaded (${videoRequests()} requests)`);
    check(errors.length === 0, `reduced motion: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
    await browser.close();
  }
  // Video fails to load.
  {
    const browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/pro-hero.mp4", (r) => r.abort());
    await page.goto(URL, { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({
      video: +getComputedStyle(document.querySelector("section video")).opacity,
      poster: document.querySelector("section img").naturalWidth > 0,
    }));
    check(r.video === 0 && r.poster, "no video: poster stays, video layer hidden");
    check(errors.length === 0, `no video: no page errors${errors.length ? " — " + errors.join("; ") : ""}`);
    await browser.close();
  }
}

await widthRuns();
await autoplayRun({ width: 1440, height: 900 }, "desktop");
await autoplayRun({ width: 390, height: 844 }, "mobile");
await fallbackRuns();
console.log(failures.length ? `\n${failures.length} check(s) failed` : "\nall hero checks passed");
process.exit(failures.length ? 1 : 0);
