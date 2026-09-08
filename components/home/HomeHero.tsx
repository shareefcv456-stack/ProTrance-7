"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useSpring,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { StaggerText } from "@/components/motion/StaggerText";

const ease = [0.22, 1, 0.36, 1] as const;

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

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
   a MotionValue (so the DOM overlays below can bind with useTransform). */

/** Where each stage starts, as scroll progress. Explicit rather than four
    equal quarters, because the story is not evenly paced: the dock earns
    nearly a third of the scroll and the yard arrival only the last fifth.
    Equal quarters put "In transit" on screen while the forklift was still
    working. */
const STAGE_AT = [0, 0.5, 0.7, 0.86];

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

/** Scroll band for chapter `i`: fade in, hold, fade out. The first chapter
    is opaque from the top and the last holds to the end, so the scene never
    drops to bare photo between crossfades. */
const FADE = 0.05;
function band(i: number, n: number): [number[], number[]] {
  const from = STAGE_AT[i];
  const to = i === n - 1 ? 1 : STAGE_AT[i + 1];
  const input = [from - FADE, from + FADE, to - FADE, to + FADE];
  if (i === 0) [input[0], input[1]] = [-1, -0.5];
  if (i === n - 1) [input[2], input[3]] = [2, 3];
  return [input, [0, 1, 1, 0]];
}

/** Which stage a given progress is in. */
function stageAt(p: number) {
  let i = 0;
  for (let k = 1; k < STAGE_AT.length; k++) if (p >= STAGE_AT[k]) i = k;
  return i;
}

/** Chapter index in the corner — all four always visible, the active one lit. */
function ChapterTick({
  index,
  progress,
}: {
  index: number;
  progress: MotionValue<number>;
}) {
  const [input, output] = band(index, chapters.length);
  const active = useTransform(progress, input, output);
  const opacity = useTransform(active, (v) => 0.3 + v * 0.7);
  const width = useTransform(active, [0, 1], [12, 34]);

  // Sub-text belongs to the active stage only. The row keeps a fixed height
  // so fading one in never shifts the stages below it.
  const subOpacity = useTransform(active, [0.55, 1], [0, 1]);
  const subX = useTransform(active, [0.55, 1], [10, 0]);

  return (
    <div className="flex h-8 flex-col items-end justify-start sm:h-9">
      <motion.div style={{ opacity }} className="flex items-center gap-2 sm:gap-3">
        {/* Numbers only on a phone. The stacked layout puts the headline
            directly under this column, and the full labels ran across it —
            and the active stage's name is already spelled out at the top of
            the copy, so the ticks lose nothing by being just the index. */}
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white">
          <span className="text-accent">{String(index + 1).padStart(2, "0")}</span>
          <span className="hidden sm:inline"> {chapters[index].label}</span>
        </span>
        <motion.span style={{ width }} className="h-px bg-accent" />
      </motion.div>
      {/* Sub-text belongs to the active stage only, and only where there is
          room for it — on a phone the column is already the width of the
          label. */}
      <motion.span
        style={{ opacity: subOpacity, x: subX }}
        className="mt-1 hidden text-[10px] leading-none text-white/55 sm:block"
      >
        {chapters[index].sub}
      </motion.span>
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
  // Desktop gets 260vh of runway so the four clips have room to breathe;
  // below lg the section keeps its natural height and the sequence plays
  // out over the hero's own scroll-out.
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
  // A spring here rather than ScrollTrigger's scrub: scrub smooths the
  // driver, which would land on top of the scene's own damping and make the
  // camera mushy. This smooths only the readers.
  const eased = useSpring(scroll, { stiffness: 140, damping: 32, mass: 0.4 });
  // The poster holds until the canvas has drawn a real frame. Fading on a
  // timer instead meant a slow GPU showed an empty canvas washing over the
  // photograph — the one moment the photograph is doing all the work.
  const [painted, setPainted] = useState(false);
  // The scene chunk is ~363k of three.js, GSAP and addons, and next/dynamic
  // requests it the moment the component renders — in parallel with the very
  // image the LCP is measured on. Deferring it takes the whole download off
  // the critical path.
  //
  // But *only* deferring it is what made the hero take nine seconds to
  // appear: gating on the poster's onLoad alone put 668k of three.js strictly
  // behind a full image round-trip, so a slow poster (or a cold image
  // optimizer) held the 3D hostage for its entire duration. Whichever lands
  // first now releases the scene — the poster, or the first idle slot after
  // paint, with a hard 700ms ceiling so a busy main thread cannot stall it
  // either. On a fast connection the poster still wins and nothing changes;
  // on a slow one the two now overlap instead of queueing.
  const [poster, setPoster] = useState(false);
  const releaseScene = useCallback(() => setPoster(true), []);
  useEffect(() => {
    const ric = window.requestIdleCallback;
    if (!ric) {
      const t = window.setTimeout(releaseScene, 300);
      return () => window.clearTimeout(t);
    }
    const id = ric(releaseScene, { timeout: 700 });
    return () => window.cancelIdleCallback(id);
  }, [releaseScene]);
  // Resolved in an effect rather than at render, so the server and the first
  // client pass agree and hydration stays quiet.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    setPhone(window.matchMedia(PHONE_QUERY).matches);
  }, []);
  const showScene = !reduce && !(SKIP_3D_ON_MOBILE && phone);
  const onReady = useCallback(() => setPainted(true), []);

  useEffect(() => {
    if (reduce) return;
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
      trigger = stMod.ScrollTrigger.create({
        trigger: scene.current,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          progress.current = self.progress;
          scroll.set(self.progress);
        },
      });
    })();

    return () => {
      cancelled = true;
      trigger?.kill();
    };
  }, [reduce, scroll]);

  // Which chapter's copy is showing. This is React state rather than a
  // MotionValue on purpose: the text has to change as a discrete swap, not a
  // continuous interpolation, and it fires four times across the whole
  // scroll — which is nothing like the per-frame updates the scene ref
  // exists to avoid.
  const [stage, setStage] = useState(0);
  useMotionValueEvent(eased, "change", (v) => {
    const next = stageAt(v);
    setStage((cur) => (cur === next ? cur : next));
  });
  const copy = reduce ? chapters[0] : chapters[stage];

  // No transform on this panel, and specifically no scale. R3F measures its
  // container with getBoundingClientRect() and does not pass offsetSize to
  // react-use-measure, so an ancestor transform feeds back into the measured
  // size: a 0.94 scale made it call gl.setSize(0.94w, 0.94h), which writes
  // that width onto the canvas element's own style. The canvas then covered
  // 94% of an already-94% box and the poster photo showed through the
  // remainder — the sky band down the right edge at the yard stage.
  //
  // The sticky pin already releases at exactly p = 1, because the panel is
  // one viewport tall in a 260vh section. That hand-off never needed help.

  return (
    <section
      ref={scene}
      // bg-ink, not the page's near-white: the release below scales the panel
      // to 0.94, and whatever sits behind it becomes a visible frame on all
      // four sides. Against #fffcfc that frame reads as a white gap tearing
      // open down the edges; against ink it reads as the panel insetting.
      className="relative bg-ink h-[300vh] lg:h-[380vh]"
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
          <div className="relative h-screen min-h-[650px] overflow-hidden bg-ink">
            {/* Scroll-driven WebGL scene. The photograph is the poster until
                the canvas paints, and is the whole of the reduced-motion
                experience — then it fades out entirely, so there is no second
                background layer left underneath that could ever show through
                at an edge. */}
            <div className="absolute inset-0 overflow-hidden">
              <Image
                src="/hero.jpg"
                alt="A PRO TRANS container truck at a port terminal, dock crew loading beside stacked shipping containers"
                fill
                priority
                // 2.1MB of source PNG behind a black scrim at 40-85% opacity.
                // Nothing here survives that at full quality, and this is the
                // LCP element, so the bytes are the metric.
                quality={68}
                sizes="(min-width: 1400px) 1320px, 100vw"
                onLoad={releaseScene}
                // A poster that 404s must not also cost the 3D — this gate
                // is a scheduling hint, not a dependency.
                onError={releaseScene}
                className={`object-cover object-[62%_center] transition-opacity duration-700 ${
                  painted ? "opacity-0" : "opacity-100"
                }`}
              />
              {showScene && poster && (
                <motion.div
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: painted ? 1 : 0 }}
                  transition={{ duration: 0.9, ease }}
                >
                  <HeroScene progress={progress} onReady={onReady} />
                </motion.div>
              )}
            </div>


            {/* Chapter index.

                Cleared below the fixed navbar at every width. The bar is 16px
                from the top and 64px tall above sm, so `sm:top-6` (24px) ran
                the "01 Warehouse" and "02 In Transit" rows straight through
                the back of it — visible in any screenshot of the desktop
                hero. 5.5rem clears the 80px with room to breathe. */}
            {showScene && (
              <div className="absolute right-4 top-[4.6rem] z-10 flex flex-col items-end gap-1 sm:right-6 sm:top-[5.5rem]">
                {chapters.map((c, i) => (
                  <ChapterTick key={c.label} index={i} progress={eased} />
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
            <div className="relative z-20 transform-gpu flex h-screen min-h-[650px] flex-col p-7 pb-8 pt-20 sm:p-12 sm:pb-10 sm:pt-32 lg:p-16 lg:pb-12 lg:pt-32">
              {/* Stage marker, headline and paragraph, all keyed to the same
                  stage so they change together.

                  One h1 and one p in the DOM at a time, with the text swapped
                  rather than four copies stacked and faded: four h1 elements
                  is four headings for a screen reader to walk through, and
                  the outgoing copy stays selectable and searchable while it
                  is invisible. AnimatePresence mode="wait" holds the incoming
                  until the outgoing has gone, so they never overlap. */}
              <div className="min-h-[230px] sm:min-h-[290px] lg:min-h-[320px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={stage}
                    initial={reduce ? false : { opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? undefined : { opacity: 0, y: -12 }}
                    transition={{ duration: 0.42, ease }}
                  >
                    {!reduce && (
                      <span
                        className="mb-5 block font-mono text-[11px] uppercase tracking-[0.18em] text-accent"
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
                    <h1 className="max-w-[720px] font-display text-[clamp(1.75rem,5.4vw,4rem)] font-600 leading-[1.04] tracking-tighter text-white">
                      {copy.title.map((line, i) => (
                        <span key={line} className="block">
                          {stage === 0 && !reduce ? (
                            <StaggerText text={line} delay={0.1 + i * 0.18} />
                          ) : (
                            line
                          )}
                        </span>
                      ))}
                    </h1>
                    {/* text-pretty keeps the last line from breaking to a
                        single orphaned word. */}
                    <p className="mt-5 max-w-[480px] text-pretty text-base leading-relaxed text-white/80 sm:text-lg">
                      {copy.body}
                    </p>
                  </motion.div>
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
              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.95, ease }}
                className="mb-4 mt-auto inline-flex self-start items-center gap-2.5 rounded-full bg-paper/95 py-2.5 pl-3 pr-4 shadow-lg backdrop-blur"
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
              </motion.div>

              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7, ease }}
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
                  className="group inline-flex items-center gap-2.5 rounded-lg bg-accent px-7 py-3.5 text-sm font-semibold text-ink transition-all duration-300 ease-smooth hover:bg-paper active:scale-[0.98]"
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
                  className="inline-flex items-center rounded-lg border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-colors duration-300 ease-smooth hover:border-white/70 hover:bg-white/[0.06]"
                >
                  Explore services
                </Link>
              </motion.div>

              {/* Service cards — one horizontal row pinned under the CTA
                  group, so the canvas centre stays clear of UI. */}
              {/* A snap rail below sm, a grid above it. Three cards squeezed
                  into a 360px row leaves each one 100px wide, which is not a
                  card — it is a truncated label. Scrolling keeps them
                  readable at full size. The negative margin lets the rail
                  bleed to the panel edge so the last card does not look
                  clipped by the padding. */}
              <div
                className="-mx-7 flex snap-x snap-mandatory gap-3 overflow-x-auto px-7 pt-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:ml-auto sm:grid sm:max-w-[620px] sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pt-10"
              >
                {chips.map((chip, i) => (
                  <motion.div
                    key={chip.title}
                    initial={reduce ? undefined : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65, delay: 0.85 + i * 0.12, ease }}
                    className="flex min-w-[58%] shrink-0 snap-start flex-col rounded-2xl border border-white/20 bg-white/[0.10] p-4 shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md sm:min-w-0 sm:shrink sm:p-5"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-accent">
                      <svg
                        className="h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        {chip.icon}
                      </svg>
                    </span>
                    <span className="mt-3 block font-display text-sm font-600 leading-snug text-paper sm:mt-4">
                      {chip.title}
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-grey-300">
                      {chip.body}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
