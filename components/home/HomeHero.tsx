"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  AnimatePresence,
  m,
  useMotionValueEvent,
  useAnimationFrame,
  useMotionValue,
} from "framer-motion";
import { StaggerText } from "@/components/motion/StaggerText";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { pace, story, STORY_LENGTH, type Pace } from "@/lib/pace";
import { probeGpuOffThread, SOFTWARE_GPU } from "@/lib/gpu-probe";

const ease = [0.22, 1, 0.36, 1] as const;

/** 200 bytes of the first frame, blurred, carried inline in the HTML.
 *
 * The poster below is 38kB and needs its own request: on the 3G profile the
 * round trip put the truck on screen at ~1.25s. This costs no request at
 * all — it arrives with the markup, so it paints as soon as the hero does
 * and the composition (dark dock left, sky right, apron below) is there
 * while the real poster is still in flight. The gradient it sits on is the
 * scene's own sky, so the two agree and the hand-off is a sharpening rather
 * than a change of picture, not a jump to a different image. */
const LQIP =
  "data:image/webp;base64,UklGRqoAAABXRUJQVlA4IJ4AAACwBACdASogABQAPsVSo0unpSMhsAwA8BiJYwDA3CHPLHfYuHK9OWfJ/l1dVswAAP6EFEK0ZhPBTYDiS2caKdG0D6RIQKffgTtUG76aOKv8fkioRsU+P24s/hNmHOWlPhbRzviR85bE5RUbPam3kMlZvwwG+Cc3tg1o8bABaGwdv5qCvqo6zhLfJBOnsoD9q9GbZVzyAYr4sIpXamd4AA==";

/* Imported by hand, after the first paint, rather than through next/dynamic:
   Next preloads a dynamic() chunk from the page's own payload, so three.js,
   R3F and the scene (~300k over the wire) were requested at 0.25s, racing the
   hero copy on a slow connection. PageSpeed's simulated LCP counts every
   request that starts before the LCP paint, and those were most of its 4.4s. */
type SceneComponent = typeof import("./HeroScene").default;

/** A scene that throws (no context, a driver fault) reports it and renders
    nothing, so the poster stays up instead of the page losing its root. */
class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Serve phones the poster instead of the WebGL hero.
 *
 * Off, deliberately: the brief requires the 3D truck to be clearly visible
 * on mobile, so the scene ships to phones and the saving is taken out of the
 * scene instead — the "low" quality path drops shadows, the bloom composer,
 * two thirds of the container field and roughly half the palms, cartons and
 * traffic, and caps the pixel ratio. The hero vehicle itself is never
 * reduced, which is the one thing the brief rules out.
 *
 * The cost is real and worth stating: three.js, its addons, gsap and
 * ScrollTrigger are ~363k gzipped of JavaScript before a line of this
 * project's own code, and Lighthouse's mobile profile applies roughly a 4x
 * CPU slowdown on top. /image.png still covers the first paint and the whole
 * reduced-motion experience.
 *
 * Flip this back to true to trade the mobile 3D for that budget. */
const SKIP_3D_ON_MOBILE = false;

/** One definition of "phone", used by the render gate and by the GSAP gate
    below. They have to agree: skipping the canvas but still loading a scroll
    driver for it would leave the larger half of the saving on the table. */
const PHONE_QUERY = "(max-width: 767px), (pointer: coarse)";

/* ── Scroll-driven 3D hero ───────────────────────────────────────────────
   GSAP ScrollTrigger is the single scroll source. It writes to a ref (read
   inside the canvas's useFrame, so scrolling causes no React render) and to
   a MotionValue (paced below, which drives the chapter state). */

/** Where each stage starts, as scroll progress — read off HeroScene's own
    timeline, not picked by eye. The truck loads until 0.52 and clears the
    warehouse gate at ~0.583 (travelled() reaching EXIT_Z), so "In transit"
    cannot start before then; the coastal bend nears its apex past 0.67; the
    terminal barrier starts lifting at 0.82 (GATE_HOLD_A). Retime the scene
    and these move with it. */
const STAGE_AT = [0, 0.583, 0.67, 0.82];
/** Dead band around each boundary, so a scroll parked on the line cannot
    flicker the chapter. */
const STAGE_HYST = 0.003;

/** The story completes at this share of the pinned scroll; the rest is a
    hold on the final frame. The story trails the scroll by design (see
    lib/pace), so without a hold a quick fling released the pin while the
    truck was still reversing and the ending played off-screen. */
const STORY_END = 0.85;

const chapters = [
  {
    label: "Warehouse",
    sub: "Crates loading at the dock",
    title: ["Logistics that keep", "retail moving."],
    body: "FMCG freight across South India with Pan-India reach. Cold-chain ready and GPS-tracked throughout.",
  },
  {
    label: "In Transit",
    sub: "Pan-India line haul",
    title: ["Sealed at the dock.", "Tracked to the door."],
    body: "Line haul across the national corridors, every handover logged against the docket.",
  },
  {
    label: "Coastal run",
    sub: "Coastal corridor, NH-66",
    title: ["Cold chain that holds", "the whole way."],
    body: "Thermo King units at 2–8°C down NH-66, temperature logged end to end, not just at the gate.",
  },
  {
    label: "Yard arrival",
    sub: "Delivered, on time",
    title: ["Backed onto the quay,", "on schedule."],
    body: "Reversed into the bay, doors open, paperwork signed. On-time delivery across India.",
  },
];

/** Where the badge, CTAs and cards come in: the final beat, as the truck
    is unloaded and its rear doors have swung shut again (DOORS_SHUT in
    HeroScene). Until then the story has the screen to itself. They go again
    at the same point on the way back, read off the same eased progress the
    scene uses, so they stay in step with it rather than with the raw
    scroll. Opacity and transform only — every element keeps its box. */
const UI_AT = 0.9995;
const UI_OUT_AT = 0.997;
/** Reveal stagger, top to bottom. Hiding runs together and quicker. */
const uiTransition = (show: boolean, at: number, duration: number) => ({
  duration: show ? duration : 0.35,
  delay: show ? at : 0,
  ease,
});

/** Chapter copy swap. Short enough that the shortest chapter (~1.2s at the
    pace cap) still lands fully opaque, so the copy is never caught
    mid-fade when the scroll comes to rest. */
const COPY_OUT = 0.16;
const COPY_IN_S = 0.3;

/** Which stage a given progress is in, holding `prev` inside the dead band. */
function stageAt(p: number, prev: number) {
  let i = 0;
  for (let k = 1; k < STAGE_AT.length; k++) {
    if (p >= STAGE_AT[k] + (k > prev ? STAGE_HYST : -STAGE_HYST)) i = k;
  }
  return i;
}

/** Chapter index in the corner — all four always visible, the active one lit.
    Driven by the same `stage` as the headline, so the two cannot disagree. */
function ChapterTick({ index, active }: { index: number; active: boolean }) {
  const t = { duration: 0.35, ease };
  return (
    <div className="flex h-8 flex-col items-end justify-start sm:h-9">
      <m.div
        initial={false}
        animate={{ opacity: active ? 1 : 0.3 }}
        transition={t}
        className="flex items-center gap-2 sm:gap-3"
      >
        {/* Numbers only on a phone. The stacked layout puts the headline
            directly under this column, and the full labels ran across it —
            and the active stage's name is already spelled out at the top of
            the copy, so the ticks lose nothing by being just the index. */}
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white">
          <span className="text-accent">{String(index + 1).padStart(2, "0")}</span>
          <span className="hidden sm:inline"> {chapters[index].label}</span>
        </span>
        <m.span
          initial={false}
          animate={{ width: active ? 34 : 12 }}
          transition={t}
          className="h-px bg-accent"
        />
      </m.div>
      {/* Sub-text belongs to the active stage only, and only where there is
          room for it — on a phone the column is already the width of the
          label. The row keeps a fixed height so it never shifts the others. */}
      <m.span
        initial={false}
        animate={{ opacity: active ? 1 : 0, x: active ? 0 : 10 }}
        transition={t}
        className="mt-1 hidden text-[10px] leading-none text-white/55 sm:block"
      >
        {chapters[index].sub}
      </m.span>
    </div>
  );
}

/** Trust chips anchored to the hero's bottom-right edge (desktop). */
const chips = [
  {
    title: "Dedicated fleet",
    body: "Modern Ashok Leyland trucks",
    icon: (
      <path
        d="M3 13V6a1 1 0 0 1 1-1h9v8M13 8h4l3 3v2M3 13h17M7.5 17.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Cold chain",
    body: "Thermo King units, 2–8°C",
    icon: (
      <path
        d="M12 3v18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M4.2 7.5l15.6 9M4.2 7.5 5 11m-.8-3.5L7.7 6.6M19.8 16.5 19 13m.8 3.5-3.5.9M4.2 16.5l15.6-9M4.2 16.5 7.7 17.4m-3.5-.9L5 13M19.8 7.5l-3.5-.9m3.5.9L19 11"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Live tracking",
    body: "24/7 GPS on every load",
    icon: (
      <>
        <path
          d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="10" r="2.4" strokeWidth="1.6" />
      </>
    ),
  },
];

export function HomeHero() {
  const reduce = useReducedMotion();
  const scene = useRef<HTMLElement>(null);
  // Runway: 620svh on touch, where a swipe travels about a screen's worth
  // so the runway should scale with the screen. On desktop a wheel notch is
  // a fixed ~100px whatever the screen, so a short laptop needs a pixel floor
  // or it gets half the notches per chapter a tall monitor does. Paired with
  // the pace cap in lib/pace; the sticky panel pins for all of it. Sized so
  // the dock stage keeps the ~20 wheel notches it had before story() gave
  // the later stages their own shares (~9–11 notches each, up from 3–6).
  const progress = useRef(0);
  // Touch scrolling covers far less document per gesture than a wheel, so a
  // phone needs its own runway or the whole eight-beat story flies past in
  // two flicks. Shorter than desktop's, because a phone user is paying for
  // every one of those viewports in thumb travel.
  const scroll = useMotionValue(0);
  // The canvas already damps its own copy of progress inside the render
  // loop; this is the DOM's equivalent, so the text fades and the chapter
  // index ease on the same kind of curve instead of snapping frame-for-frame
  // with the raw scroll position while the scene glides.
  //
  // Paced here rather than with ScrollTrigger's scrub: scrub smooths the
  // driver, which would land on top of the scene's own damping and make the
  // camera mushy. This smooths only the readers, on the scene's own curve.
  const eased = useMotionValue(0);
  const paced = useRef<Pace>({ value: 0, rate: 0 });
  useAnimationFrame((_, delta) => {
    // Returns false once settled, so an idle page does no motion-value work.
    if (pace(paced.current, scroll.get(), delta / 1000)) eased.set(story(paced.current.value));
  });
  // The gradient backdrop holds until the canvas has drawn a real frame.
  // Fading on a timer instead meant a slow GPU washed an empty canvas over
  // the backdrop before there was anything in it.
  const [painted, setPainted] = useState(false);
  // The scene chunk is requested as soon as this mounts, rather than on the
  // first idle slot.
  //
  // It used to wait for requestIdleCallback (700ms ceiling), which kept the
  // three.js download off the critical path — correct when the only thing
  // behind the canvas was a bare CSS gradient, because nothing was waiting
  // on it to look finished. Measured against a throttled connection that
  // deferral was part of a 1.2s wait on 4G and 3.9s on 3G during which the
  // hero was an empty sky: the scene is the above-the-fold subject, so the
  // page looked broken for the whole of it.
  //
  // The poster below now covers that window with the real first frame, so
  // the visitor never waits on an empty hero either way — and with the gap
  // covered, the right move for the remaining time is to start the download
  // sooner, not later.
  // Resolved in an effect rather than at render, so the server and the first
  // client pass agree and hydration stays quiet.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    setPhone(window.matchMedia(PHONE_QUERY).matches);
  }, []);
  const showScene = !reduce && !(SKIP_3D_ON_MOBILE && phone);
  const onReady = useCallback(() => setPainted(true), []);
  // The scene will not arrive: no usable GPU, a lost context, a render error
  // or a chunk that failed to load. The poster is the fallback and the copy
  // still runs off the scroll; the loader must not spin over it forever.
  const [failed, setFailed] = useState(false);
  const onFail = useCallback(() => setFailed(true), []);
  // Only once the wait is long enough to notice. On a healthy connection the
  // scene replaces the poster inside a second and this never shows.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!showScene || painted || failed) return;
    const id = window.setTimeout(() => setSlow(true), 1200);
    return () => window.clearTimeout(id);
  }, [showScene, painted, failed]);

  /* Nothing heavy starts until the hero's first frame has been presented.

     The 3D chunks and GSAP used to be requested during hydration, and on
     PageSpeed's mobile profile the headline and paragraph (the LCP element)
     waited behind them. The poster is the scene's own first frame, so the
     canvas arriving a moment later changes nothing visible. */
  const [afterPaint, setAfterPaint] = useState(false);
  useEffect(() => {
    if (!showScene) return;
    let idle = 0;
    let fired = false;
    let observer: PerformanceObserver | undefined;
    const go = () => {
      if (fired) return;
      fired = true;
      observer?.disconnect();
      // An idle slot after the paint, capped so a busy page cannot hold it off.
      const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1));
      idle = ric(() => setAfterPaint(true), { timeout: 600 });
    };
    // Keyed to the browser's own first-contentful-paint entry, not to
    // requestAnimationFrame: on a cold start rAF runs frames that are never
    // presented, and it fired a full second before the text was on screen.
    // The hero copy is the LCP element and paints in that same frame.
    if (PerformanceObserver.supportedEntryTypes?.includes("paint")) {
      observer = new PerformanceObserver((list) => {
        if (list.getEntriesByName("first-contentful-paint").length) go();
      });
      observer.observe({ type: "paint", buffered: true });
    } else {
      // No paint timing: two frames is the best available stand-in.
      requestAnimationFrame(() => requestAnimationFrame(go));
    }
    // A tab opened in the background never records a first paint at all.
    // Only a backstop: a cold start in the lab takes up to four seconds to
    // present its first frame and must not be cut short.
    const backstop = window.setTimeout(go, 6000);
    const onShow = () => {
      if (document.visibilityState === "visible") requestAnimationFrame(() => requestAnimationFrame(go));
    };
    if (document.visibilityState === "hidden") document.addEventListener("visibilitychange", onShow);
    return () => {
      observer?.disconnect();
      window.clearTimeout(backstop);
      document.removeEventListener("visibilitychange", onShow);
      (window.cancelIdleCallback ?? window.clearTimeout)(idle);
    };
  }, [showScene]);

  /* Renderer string, read in a worker from mount: null while pending, "" if
     unknown. A software rasteriser is told apart here, before three.js and the
     scene (~250k) are fetched, and without the seconds-long main-thread stall
     its first WebGL context costs. See lib/gpu-probe. */
  const [renderer, setRenderer] = useState<string | null>(null);
  useEffect(() => {
    if (!showScene) return;
    let live = true;
    void probeGpuOffThread().then((name) => {
      if (!live) return;
      if (SOFTWARE_GPU.test(name)) setFailed(true);
      else setRenderer(name);
    });
    return () => {
      live = false;
    };
  }, [showScene]);

  const [HeroScene, setHeroScene] = useState<SceneComponent | null>(null);
  useEffect(() => {
    if (!afterPaint || renderer === null) return;
    let cancelled = false;
    import("./HeroScene").then(
      (mod) => {
        if (!cancelled) setHeroScene(() => mod.default);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [afterPaint, renderer]);

  useEffect(() => {
    // Waits for the first paint with the scene chunk, for the same reason.
    if (reduce || !afterPaint) return;
    // Checked here rather than from the `phone` state above, and that matters:
    // state resolves after the first render, by which point this effect has
    // already fired and the import is in flight. Querying synchronously means
    // GSAP is never requested on a phone when the canvas is not going to be
    // there either — the two gates have to agree.
    if (SKIP_3D_ON_MOBILE && window.matchMedia(PHONE_QUERY).matches) return;

    let cancelled = false;
    let trigger: { kill: () => void } | undefined;

    // Imported lazily so GSAP stays out of the initial bundle.
    void (async () => {
      const [gsapMod, stMod] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled || !scene.current) return;
      const gsap = gsapMod.gsap ?? gsapMod.default;
      gsap.registerPlugin(stMod.ScrollTrigger);
      // Mobile address bars resize the viewport as they show and hide; a
      // refresh on each one re-measured the pin mid-gesture and jumped the
      // story. The runway is in svh, which does not move with the bar.
      stMod.ScrollTrigger.config({ ignoreMobileResize: true });
      trigger = stMod.ScrollTrigger.create({
        trigger: scene.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          // In story() units: see STORY_LENGTH in lib/pace.
          const p = Math.min(1, self.progress / STORY_END) * STORY_LENGTH;
          progress.current = p;
          scroll.set(p);
        },
      });
    })();

    return () => {
      cancelled = true;
      trigger?.kill();
    };
  }, [reduce, scroll, afterPaint]);

  // Which chapter is showing — the one value the index ticks, the stage
  // marker, the headline and the paragraph all read, taken straight off the
  // same eased progress the scene renders from. React state rather than a
  // MotionValue on purpose: the text changes as a discrete swap, four times
  // across the whole scroll.
  //
  // It used to step one chapter at a time, each swap waiting for the last
  // to land. That chain is what put the copy out of step with the scene and
  // left it mid-fade at rest. It is not needed to avoid skipping a beat:
  // lib/pace gives every chapter its own share of the scroll and caps the
  // rate, so even the shortest is on screen ~1.2s, far longer than one swap
  // (COPY_OUT + COPY_IN_S).
  const [stage, setStage] = useState(0);
  const stageRef = useRef(0);
  // The word-by-word reveal is the page-load moment only. Replaying it on
  // the way back up held the headline off-screen for ~1.5s.
  const intro = useRef(true);
  const [uiIn, setUiIn] = useState(false);
  const uiShown = useRef(false);
  // Runs every frame the story moves, so it only touches React when a value
  // actually changes.
  useMotionValueEvent(eased, "change", (v) => {
    const next = stageAt(v, stageRef.current);
    if (next !== stageRef.current) {
      stageRef.current = next;
      intro.current = false;
      setStage(next);
    }
    // Hysteresis, so a scroll parked right on the line cannot flicker it.
    const ui = uiShown.current ? v >= UI_OUT_AT : v >= UI_AT;
    if (ui !== uiShown.current) {
      uiShown.current = ui;
      setUiIn(ui);
    }
  });
  // Reduced motion has no story to wait for: everything is there at once.
  const showUi = reduce || uiIn;
  const copy = reduce ? chapters[0] : chapters[stage];

  // No transform on this panel, and specifically no scale. R3F measures its
  // container with getBoundingClientRect() and does not pass offsetSize to
  // react-use-measure, so an ancestor transform feeds back into the measured
  // size: a 0.94 scale made it call gl.setSize(0.94w, 0.94h), which writes
  // that width onto the canvas element's own style. The canvas then covered
  // 94% of an already-94% box and the poster photo showed through the
  // remainder — the sky band down the right edge at the yard stage.
  //
  // The sticky pin releases at the end of the section, after the story has
  // finished and held (STORY_END). That hand-off never needed help.

  return (
    <section
      ref={scene}
      // bg-ink, not the page's near-white: the release below scales the panel
      // to 0.94, and whatever sits behind it becomes a visible frame on all
      // four sides. Against #fffcfc that frame reads as a white gap tearing
      // open down the edges; against ink it reads as the panel insetting.
      className="relative bg-ink h-[731svh] lg:h-[max(913vh,7860px)]"
    >
      {/* The pinned panel and the copy column both get their own compositor
          layer. Without it every scroll tick repaints a full-viewport stack
          of gradients, blurred chips and text against a canvas that is
          itself changing — on the main thread, next to the scroll handler. */}
      {/* Pinned at every breakpoint now that phones get the scene: without
          this the section is 300vh of scroll with the canvas scrolled off the
          top of it after the first one. */}
      <div className="transform-gpu will-change-transform sticky top-0">
        {/* Hero module — inset rounded image panel */}
        <div className="relative">
          {/* h-svh, not h-screen with a min-height: a sticky panel taller than the
              visible viewport has its bottom (the cards) cut off for the whole
              pin. svh is the height with mobile browser chrome showing. */}
          <div className="relative h-svh overflow-hidden bg-ink">
            {/* Scroll-driven WebGL scene. There is no poster photograph —
                the hero is the 3D scene and nothing else.

                What sits under it until the first frame paints is a CSS
                gradient, and its stops are the scene's own sky gradient from
                useProceduralEnv: blue zenith, hazy horizon band, dark ground.
                Behind the scrim that reads as an out-of-focus sky, and when
                the canvas fades in it is fading onto approximately the
                colours already there — so the hand-off is the scene
                resolving rather than one image replacing another. */}
            <div
              className="absolute inset-0 overflow-hidden bg-[linear-gradient(180deg,#3f6fae_0%,#8fb0cd_30%,#d6dde0_44%,#f3ecdf_50%,#9c8f7e_56%,#3a332b_100%)]"
              // Both layers named here on purpose. An inline background-image
              // replaces the class's outright rather than stacking with it,
              // and the thumbnail is opaque, so the gradient would be dead
              // weight if it were only in the class. Declaring it as the
              // lower layer keeps it as the fallback that actually paints if
              // the data URI ever fails to decode.
              style={{
                backgroundImage: `url("${LQIP}"), linear-gradient(180deg,#3f6fae 0%,#8fb0cd 30%,#d6dde0 44%,#f3ecdf 50%,#9c8f7e 56%,#3a332b 100%)`,
                backgroundSize: "cover, cover",
                backgroundPosition: "center, center",
              }}
            >
              {/* First frame of the scene as a static image, behind the
                  canvas and in the initial HTML so the preload scanner finds
                  it immediately. 38kB desktop / 15kB mobile of WebP — about
                  165ms on the 3G profile that waits 3.9s for the canvas.

                  Re-capture both files (and the LQIP above) whenever the
                  scene's opening frame changes: a stale poster made the
                  truck jump and ghost through the crossfade to the canvas.

                  Two files rather than one scaled: the camera framing at
                  p = 0 is a landscape composition with the truck right of
                  centre, and object-cover cropping that to a 0.46 aspect
                  phone screen throws the truck off the frame. `picture`
                  picks one and downloads only that.

                  Rendered even when `showScene` is false, which is the
                  reduced-motion case: a still of the dock is a better answer
                  there than a bare gradient, and it is already static.

                  aria-hidden with an empty alt: the canvas it stands in for
                  is aria-hidden too, and the headline beside it already
                  carries the meaning. */}
              <picture>
                <source
                  media="(max-width: 767px)"
                  srcSet="/hero-poster-mobile.webp"
                  width={760}
                  height={1645}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/hero-poster.webp"
                  alt=""
                  aria-hidden="true"
                  width={1600}
                  height={1000}
                  fetchPriority="high"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </picture>
              {showScene && HeroScene && !failed && (
                <m.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: painted ? 1 : 0 }}
                  transition={{ duration: 0.9, ease }}
                >
                  <SceneBoundary onError={onFail}>
                    <HeroScene progress={progress} renderer={renderer ?? ""} onReady={onReady} onFail={onFail} />
                  </SceneBoundary>
                </m.div>
              )}
            </div>


            {/* Loading state, over the poster, while the 3D scene is still
                coming in. The poster is the scene's own first frame, so the
                hero already looks right; this only says it is not live yet. */}
            <AnimatePresence>
              {showScene && slow && !painted && !failed && (
                <m.div
                  role="status"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease }}
                  className="absolute bottom-6 right-4 z-10 flex w-44 flex-col gap-2 sm:right-6 rounded-lg border border-white/15 bg-ink/70 px-4 py-3 sm:flex"
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/80">
                    <span className="text-accent">●</span> Loading 3D scene
                  </span>
                  <span className="relative h-px overflow-hidden bg-white/15">
                    <m.span
                      className="absolute inset-y-0 left-0 w-1/3 bg-accent"
                      animate={{ x: ["-100%", "300%"] }}
                      transition={{ duration: 1.4, ease: "easeInOut", repeat: Infinity }}
                    />
                  </span>
                </m.div>
              )}
            </AnimatePresence>

            {/* Chapter index.

                Cleared below the fixed navbar at every width. The bar is 16px
                from the top and 64px tall above sm, so `sm:top-6` (24px) ran
                the "01 Warehouse" and "02 In Transit" rows straight through
                the back of it — visible in any screenshot of the desktop
                hero. 5.5rem clears the 80px with room to breathe. */}
            {showScene && (
              <div className="absolute right-4 top-[4.6rem] z-10 flex flex-col items-end gap-1 sm:right-6 sm:top-[5.5rem]">
                {chapters.map((c, i) => (
                  <ChapterTick key={c.label} index={i} active={i === stage} />
                ))}
              </div>
            )}

            {/* Legibility scrim — the copy column sits at full opacity on top
                of it, so nothing in the left column is ever semi-transparent.

                Two directions, because the copy is in two places. Above sm it
                sits in a left column and the scrim runs left-to-right, which
                leaves the truck on the right in clear air. Below sm the copy
                is stacked over the scene, so the same horizontal scrim would
                darken one flank of the truck and leave the headline sitting
                on a bright sky; vertical darkens the bands the text is
                actually in and keeps the middle — where the truck is —
                nearly clear. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/15 to-black/80 sm:bg-gradient-to-r sm:from-black/85 sm:via-black/40 sm:to-transparent" />
            <div className="absolute inset-x-0 bottom-0 hidden h-40 bg-gradient-to-t from-black/70 to-transparent sm:block" />

            {/* Copy */}
            {/* z-20 is belt and braces — the column already paints over the
                absolutely-positioned canvas by DOM order — but it states the
                intent, and it keeps the CTAs above anything added later. */}
            <div className="relative z-20 transform-gpu flex h-svh flex-col p-7 pb-8 pt-20 sm:p-12 sm:pb-10 sm:pt-32 lg:p-16 lg:pb-12 lg:pt-32 squat:pb-5 squat:pt-[4.5rem] short:pb-6 short:pt-24">
              {/* Stage marker, headline and paragraph, all keyed to the same
                  stage so they change together.

                  One h1 and one p in the DOM at a time, with the text swapped
                  rather than four copies stacked and faded: four h1 elements
                  is four headings for a screen reader to walk through, and
                  the outgoing copy stays selectable and searchable while it
                  is invisible. AnimatePresence mode="wait" holds the incoming
                  until the outgoing has gone, so they never overlap. */}
              <div className="min-h-[230px] sm:min-h-[290px] lg:min-h-[320px] squat:min-h-0 short:min-h-0">
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={stage}
                    initial={reduce ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0, transition: { duration: COPY_IN_S, ease } }}
                    exit={
                      reduce
                        ? undefined
                        : { opacity: 0, y: -8, transition: { duration: COPY_OUT, ease: "easeIn" } }
                    }
                  >
                    {!reduce && (
                      <span
                        className="mb-5 squat:mb-3 short:mb-3 block font-mono text-[11px] uppercase tracking-[0.18em] text-accent"
                        aria-hidden="true"
                      >
                        {String(stage + 1).padStart(2, "0")} — {copy.label}
                      </span>
                    )}
                    {/* Two blocks, so the break is a decision rather than a
                        wrap that happens to land there at one width. The
                        clamp floor is set so the longest first line still
                        fits a 360px screen inside the column padding. */}
                    {/* 720px and a 4rem cap, because the longest first line
                        is 21 characters: at the old 4.3rem cap that measured
                        ~679px against a 640px column and broke to a third
                        line on three of the four headings. */}
                    <h1 className="max-w-[720px] font-display text-[clamp(1.75rem,5.4vw,4rem)] squat:text-[1.6rem] short:text-[clamp(1.75rem,min(5.4vw,7.5vh),4rem)] font-600 leading-[1.04] tracking-tighter text-white">
                      {copy.title.map((line, i) => (
                        <span key={line} className="block">
                          {stage === 0 && intro.current && !reduce ? (
                            <StaggerText text={line} delay={0.1 + i * 0.18} />
                          ) : (
                            line
                          )}
                        </span>
                      ))}
                    </h1>
                    {/* text-pretty keeps the last line from breaking to a
                        single orphaned word. */}
                    <p className="mt-5 max-w-[480px] text-pretty text-base leading-relaxed text-white/80 sm:text-lg squat:mt-3 squat:text-[15px] short:mt-3 short:text-base">
                      {copy.body}
                    </p>
                  </m.div>
                </AnimatePresence>
              </div>


              {/* Standing claim, not a scroll payoff — it used to fade in
                  with the rear doors at p 0.84, so it never appeared at all
                  on mobile and only briefly on desktop.

                  In the copy flow rather than pinned to a corner: mt-auto
                  here is what pushes the badge, the buttons and the cards to
                  the bottom as one group, and self-start keeps the pill at
                  its content width instead of stretching across the column
                  the way a flex child otherwise would. */}
              {/* Reveal order follows the layout, top to bottom: badge, CTAs,
                  cards. Every one of these reserves its space while it is at
                  opacity 0 — that is what keeps the column from jumping — so
                  the order is what decides whether that space reads as empty.
                  The badge used to arrive last (0.95s) and the cards after
                  the CTAs, which left the buttons floating in a blank band
                  with the badge's slot above them and the cards' below. In
                  document order each item lands directly under one that is
                  already visible. Held until the story's final beat — see UI_AT. */}
              <m.div
                initial={reduce ? undefined : { opacity: 0, y: 10 }}
                animate={showUi ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
                transition={uiTransition(showUi, 0, 0.6)}
                className="mb-4 squat:mb-2 short:mb-3 mt-auto inline-flex self-start items-center gap-2.5 rounded-full bg-paper/95 py-2.5 pl-3 pr-4 shadow-lg"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 8.4l3 3 6-6.4"
                      stroke="#272727"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="font-display text-xs font-600 text-ink">
                  On-Time All-India Delivery
                </span>
              </m.div>

              <m.div
                // pointerEvents rides the same delay as the fade, so the
                // buttons cannot be clicked while they are still invisible.
                initial={reduce ? undefined : { opacity: 0, y: 18, pointerEvents: "none" }}
                animate={
                  showUi
                    ? { opacity: 1, y: 0, pointerEvents: "auto" }
                    : { opacity: 0, y: 18, pointerEvents: "none" }
                }
                transition={uiTransition(showUi, 0.1, 0.7)}
                className="relative z-50 flex flex-wrap items-center gap-3"
              >
                <Link
                  href="/contact"
                  // Both CTAs sit in the viewport from the first paint, so Next
                  // pulls their route chunk and RSC payload while the hero's
                  // three.js is still streaming — 51k competing with the one
                  // download the visitor is actually waiting to see. They are
                  // static pages; fetching them on click costs a few hundred
                  // ms once, against a slower hero for everybody.
                  prefetch={false}
                  // Below sm both CTAs share one row. At px-7 the pair needed
                  // 335px against a 334px column at 390 (304 at 360), so
                  // "Explore services" wrapped onto its own line and left a
                  // 60px band under the buttons. px-4 fits them with room to
                  // spare; grow + basis-auto lets them fill the row evenly and
                  // still wrap, rather than overflow, on anything narrower.
                  className="group inline-flex grow basis-auto items-center justify-center gap-2.5 whitespace-nowrap rounded-lg bg-accent px-4 py-3.5 text-sm font-semibold text-ink transition-all duration-300 ease-smooth hover:bg-paper active:scale-[0.98] sm:grow-0 sm:px-7"
                >
                  Contact us
                  <svg
                    className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M3 8h9M8 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
                <Link
                  href="/services"
                  prefetch={false}
                  className="inline-flex grow basis-auto items-center justify-center whitespace-nowrap rounded-lg border border-white/30 px-4 py-3.5 text-sm font-semibold text-white transition-colors duration-300 ease-smooth hover:border-white/70 hover:bg-white/[0.06] sm:grow-0 sm:px-7"
                >
                  Explore services
                </Link>
              </m.div>

              {/* Service cards — one horizontal row pinned under the CTA
                  group, so the canvas centre stays clear of UI. */}
              {/* A vertical stack below sm, the same three-column grid at sm
                  and up.

                  This was a horizontal snap rail with `min-w-[58%]` cards,
                  and that is what did not fit: at 430px the row measured
                  731px against a 430px box, so two of the three cards were
                  parked off-screen behind a sideways scroll nobody knows to
                  perform. Squeezing three columns into a 320px screen is not
                  the alternative either — 82px is a truncated label, not a
                  card. Stacking is the only arrangement where all three are
                  visible at once *and* full-width, and going full-width is
                  what pays for the extra rows: the icon moves beside the
                  text instead of above it, so a stacked card is 56px tall
                  rather than 129px. */}
              {/* pb-0 below sm and gap-1 rather than gap-1.5: the last 5px
                  of the budget, taken out of dead space instead of out of
                  the type. The column already carries pb-8 underneath. */}
              <div className="flex flex-col gap-1 pt-1 pb-0 sm:ml-auto sm:grid sm:max-w-[620px] sm:grid-cols-3 sm:gap-4 sm:pb-1 sm:pt-10 short:pt-4">
                {chips.map((chip, i) => (
                  <m.div
                    key={chip.title}
                    initial={reduce ? undefined : { opacity: 0, y: 20 }}
                    animate={showUi ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                    transition={uiTransition(showUi, 0.2 + i * 0.1, 0.65)}
                    className="flex flex-row items-center gap-2.5 rounded-2xl border border-white/20 bg-ink/60 bg-[linear-gradient(160deg,rgba(255,255,255,0.14),rgba(255,255,255,0.04))] p-2 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] sm:flex-col sm:items-stretch sm:gap-0 sm:p-5 short:p-3.5"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent sm:h-10 sm:w-10 short:h-8 short:w-8">
                      <svg
                        className="h-4 w-4 sm:h-5 sm:w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        {chip.icon}
                      </svg>
                    </span>
                    {/* `sm:contents` dissolves this wrapper at sm and up, so
                        the title and body become direct children of the card
                        again and the desktop box is the same three-child
                        flex column it always was — no extra element in its
                        layout, nothing to re-tune. Below sm it is the text
                        block sitting beside the icon. min-w-0 lets it shrink
                        so long body copy wraps instead of widening the row. */}
                    <div className="min-w-0 sm:contents">
                      <span className="block font-display text-[13px] font-600 leading-snug text-paper sm:mt-4 sm:text-sm short:mt-2.5">
                        {chip.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-tight text-grey-300 sm:mt-1 sm:text-xs sm:leading-relaxed short:leading-snug">
                        {chip.body}
                      </span>
                    </div>
                  </m.div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
