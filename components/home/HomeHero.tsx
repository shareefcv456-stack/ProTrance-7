"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { StaggerText } from "@/components/motion/StaggerText";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

const ease = [0.22, 1, 0.36, 1] as const;

/* ── Hero video ──────────────────────────────────────────────────────────
   Plain muted autoplay, played once; the scroll has no hold on it. Encoded
   from two sources in _unused-assets (both 1280×720, 24fps, H.264, full-
   range yuvj420p): the first 9s (216 frames) of pro7_gwr_video_mvp.mp4,
   then the first 9s of pro6_gwr_video_mvp.mp4, joined into one 18s,
   432-frame file — the join is just the next frame, so it cannot flash or
   wait on a second download. Full source resolution, converted to
   limited-range BT.709 (what browsers expect), x264 CRF 16, no audio,
   faststart. Poster is frame 0 of the encoded file. */
const VIDEO_SRC = "/videos/pro-hero.mp4";
const POSTER_SRC = "/videos/pro-hero-poster.webp";
const FPS = 24;

/** Where each stage starts, in seconds of the video: the shot cuts, found by
    ffmpeg scene detection. pro7 (0–215): containers loaded onto the truck at
    the port. pro6 (216–431): warehouse dock (216), pulling out (252),
    highway (287), wheel close-up (335), quay along the sea (383), aerial
    over the container yard (418). Re-cut either clip and these move. */
const STAGE_AT = [0, 287 / FPS, 383 / FPS, 418 / FPS];

/** Landscape footage. Cover where the screen is close to its shape; on a
    portrait screen cover would crop ~75% of the width and lose the truck and
    the PRO TRANS logo, so the whole frame is shown full-width instead. */
const FIT = "object-contain [@media(min-aspect-ratio:4/3)]:object-cover";

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

/** Page-load reveal stagger, top to bottom. */
const uiTransition = (at: number, duration: number) => ({ duration, delay: at, ease });

/** Chapter copy swap. */
const COPY_OUT = 0.16;
const COPY_IN_S = 0.3;

/** Which stage a video time is in. */
const stageAt = (t: number) => STAGE_AT.filter((s) => t >= s).length - 1;

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
  const video = useRef<HTMLVideoElement>(null);
  // Video shown once it is actually playing; the poster (the same frame 0)
  // covers until then, and stays if the video never arrives.
  const [ready, setReady] = useState(false);
  // Autoplay refused, or reduced motion: offer a play button instead.
  const [needsTap, setNeedsTap] = useState(false);

  // The shot the video is in, set from its playback time.
  const [shot, setShot] = useState(0);
  const stageRef = useRef(0);
  // Which chapter is showing — the one value the index ticks, the stage
  // marker, the headline and the paragraph all read. It follows `shot`, at
  // most one swap per swap animation, so AnimatePresence mode="wait" never
  // drops a key.
  const [stage, setStage] = useState(0);
  const lastSwap = useRef(0);
  // The word-by-word reveal is the page-load moment only.
  const intro = useRef(true);
  useEffect(() => {
    if (stage === shot) return;
    const swapMs = (COPY_OUT + COPY_IN_S) * 1000 + 50;
    const id = window.setTimeout(
      () => {
        lastSwap.current = performance.now();
        intro.current = false;
        setStage(shot);
      },
      Math.max(0, lastSwap.current + swapMs - performance.now()),
    );
    return () => window.clearTimeout(id);
  }, [shot, stage]);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    // The property, not only the attribute: React does not reliably render
    // `muted`, and iOS Safari only autoplays a video that is muted.
    el.muted = true;
    const onTime = () => {
      const next = stageAt(el.currentTime);
      if (next !== stageRef.current) {
        stageRef.current = next;
        setShot(next);
      }
    };
    const onPlaying = () => {
      setReady(true);
      setNeedsTap(false);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("playing", onPlaying);
    // The query as well as `reduce`: the hook reports false for one commit
    // to keep hydration quiet, and nothing should start moving in it.
    if (reduce || matchMedia("(prefers-reduced-motion: reduce)").matches) setNeedsTap(true);
    else el.play().catch(() => setNeedsTap(true));
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("playing", onPlaying);
    };
  }, [reduce]);

  const copy = reduce ? chapters[0] : chapters[stage];

  return (
    <section className="relative bg-ink">
      {/* Hero module — inset rounded image panel */}
      <div className="relative">
        {/* h-svh: the height with mobile browser chrome showing, so the
            cards at the bottom are never under it. */}
        <div className="relative h-svh overflow-hidden bg-ink">
            {/* Poster under the video: frame 0 of the same file, in the
                initial HTML so it paints before any script runs, and the
                whole hero for reduced motion or a video that fails. Same fit
                as the video, so the hand-off is invisible. aria-hidden: the
                headline beside it already carries the meaning. */}
            <div className="absolute inset-0 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={POSTER_SRC}
                alt=""
                aria-hidden="true"
                width={1280}
                height={720}
                fetchPriority="high"
                decoding="async"
                className={`absolute inset-0 h-full w-full ${FIT}`}
              />
              {/* preload="none": play() starts the download, so reduced
                  motion never fetches 9.6MB it will not show. Played once;
                  it holds its last frame. */}
              <video
                ref={video}
                src={VIDEO_SRC}
                muted
                playsInline
                preload="none"
                disablePictureInPicture
                disableRemotePlayback
                aria-hidden="true"
                tabIndex={-1}
                className={`absolute inset-0 h-full w-full ${FIT} transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
              />
            </div>

            {needsTap && (
              <button
                type="button"
                onClick={() => video.current?.play().catch(() => {})}
                aria-label="Play hero video"
                className="absolute left-1/2 top-1/2 z-30 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-ink/60 text-white backdrop-blur-sm transition-colors duration-300 hover:bg-accent hover:text-ink"
              >
                <svg className="ml-1 h-6 w-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l13-7.5-13-7.5Z" />
                </svg>
              </button>
            )}

            {/* Chapter index.

                Cleared below the fixed navbar at every width. The bar is 16px
                from the top and 64px tall above sm, so `sm:top-6` (24px) ran
                the "01 Warehouse" and "02 In Transit" rows straight through
                the back of it — visible in any screenshot of the desktop
                hero. 5.5rem clears the 80px with room to breathe. */}
            {!reduce && (
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
              {/* pr-6 below sm clears the chapter rail pinned top-right, which
                  otherwise runs through the headline at 320px. */}
              <div className="min-h-[230px] pr-6 sm:pr-0 sm:min-h-[290px] lg:min-h-[320px] squat:min-h-0 short:min-h-0">
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
                  already visible. */}
              <m.div
                initial={reduce ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={uiTransition(0, 0.6)}
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
                animate={{ opacity: 1, y: 0, pointerEvents: "auto" }}
                transition={uiTransition(0.1, 0.7)}
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
                    animate={{ opacity: 1, y: 0 }}
                    transition={uiTransition(0.2 + i * 0.1, 0.65)}
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
    </section>
  );
}
