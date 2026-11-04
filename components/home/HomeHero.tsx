"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { StaggerText } from "@/components/motion/StaggerText";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

const ease = [0.22, 1, 0.36, 1] as const;

/* ── Hero video ──────────────────────────────────────────────────────────
   Muted, inline autoplay from 0s, played through once (no loop). The scroll
   never drives it; visibility only starts and stops it:
     · on `ended`, if the hero is still on screen, smooth-scroll to the
       "What we move" section (#what-we-move) — never for reduced motion, and
       never when the visitor has already scrolled away;
     · hero back on screen (≥50% visible) → rewind to 0 and play again;
     · hero off screen → pause, so it cannot end, or decode, out of sight.
   One 18s, 432-frame 1280×720 H.264 file: the first 9s of
   _unused-assets/pro7_gwr_video_mvp.mp4, then the first 9s of
   pro6_gwr_video_mvp.mp4. Always muted — there is no sound control. One
   file, so the join cannot flash or wait on a second download.
   Poster is frame 0 of the same file. */
const VIDEO_SRC = "/videos/pro-hero.mp4";
const POSTER_SRC = "/videos/pro-hero-poster.webp";
/** Where the hero hands over when the video ends. */
const NEXT_SECTION_ID = "what-we-move";

/** sm and up: the copy is a left column over the footage. Darkness goes only
    where copy is — a soft pool behind the headline and intro, a sky fade along
    the top, a thin left edge, a low band for the CTAs — so the truck in the
    middle and right stays close to full brightness. Tuned by measuring white
    text contrast against every second of the video at 1440 and 1280. */
const SCRIM = [
  "radial-gradient(ellipse 60% 50% at 20% 26%, rgba(0,0,0,.5), rgba(0,0,0,.25) 50%, transparent)",
  "linear-gradient(to bottom, rgba(0,0,0,.35), transparent 45%)",
  "linear-gradient(to right, rgba(0,0,0,.3), transparent 55%)",
  "linear-gradient(to top, rgba(0,0,0,.55), rgba(0,0,0,.2) 25%, transparent 45%)",
].join(",");
/** Lifts white copy off bright sky without darkening the scene around it. */
const TEXT_SHADOW = "[text-shadow:0_1px_2px_rgba(0,0,0,.25),0_2px_24px_rgba(0,0,0,.35)]";

/** Landscape footage. Cover where the screen is close to its shape; on a
    portrait screen cover would crop ~75% of the width and lose the truck and
    the PRO TRANS logo, so the whole frame is shown full-width instead. */
const FIT = "object-contain [@media(min-aspect-ratio:4/3)]:object-cover";

const headline = ["Logistics that keep", "retail moving."];
const intro =
  "FMCG freight across South India with Pan-India reach. Cold-chain ready and GPS-tracked throughout.";

/** Page-load reveal stagger, top to bottom. */
const uiTransition = (at: number, duration: number) => ({ duration, delay: at, ease });

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
  // Whether at least half the hero is on screen; read by onEnded.
  const heroVisible = useRef(false);
  const section = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = video.current;
    const hero = section.current;
    if (!el || !hero) return;
    // The property, not only the attribute: React does not reliably render
    // `muted`, and iOS Safari only autoplays a video that is muted.
    el.muted = true;
    const onPlaying = () => {
      setReady(true);
      setNeedsTap(false);
    };
    el.addEventListener("playing", onPlaying);
    // The query as well as `reduce`: the hook reports false for one commit
    // to keep hydration quiet, and nothing should start moving in it.
    // Data Saver gets the same: the poster, and 11MB only if asked for.
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    const manual = reduce || saveData || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (manual) setNeedsTap(true);

    // Fires once on observe, which is the initial autoplay; after that, on
    // every crossing of the 50% line in either direction.
    const io = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.intersectionRatio >= 0.5;
        if (visible === heroVisible.current) return;
        heroVisible.current = visible;
        if (!visible) el.pause();
        else if (!manual) {
          el.currentTime = 0;
          el.play().catch(() => setNeedsTap(true));
        }
      },
      { threshold: 0.5 },
    );
    io.observe(hero);
    return () => {
      io.disconnect();
      heroVisible.current = false;
      el.removeEventListener("playing", onPlaying);
    };
  }, [reduce]);

  const onEnded = () => {
    const auto = !(reduce || matchMedia("(prefers-reduced-motion: reduce)").matches);
    // Scrolled away already (the pause makes this rare, but a fast flick can
    // land inside the last frame): leave them where they are.
    if (auto && heroVisible.current) {
      document.getElementById(NEXT_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // Not handing over — offer a replay rather than sit on the last frame.
      setNeedsTap(true);
    }
  };

  return (
    <section ref={section} className="relative bg-ink">
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
                  motion never fetches 11MB it will not show. */}
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
                onEnded={onEnded}
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

            {/* Legibility scrim — the copy column sits at full opacity on top
                of it, so nothing in the left column is ever semi-transparent.

                Two directions, because the copy is in two places. Above sm it
                sits in a left column and the scrim runs left-to-right, which
                leaves the truck on the right in clear air. Below sm the copy
                is stacked over the scene, so the same horizontal scrim would
                darken one flank of the truck and leave the headline sitting
                on a bright sky; vertical darkens the bands the text is
                actually in and keeps the middle — where the truck is —
                nearly clear. Below sm the copy sits on the bars above and
                below the letterboxed footage, so the scrim only needs to
                soften the footage's edges into them. */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/60 sm:hidden" />
            <div className="absolute inset-0 hidden sm:block" style={{ background: SCRIM }} />

            {/* Copy */}
            {/* z-20 is belt and braces — the column already paints over the
                absolutely-positioned canvas by DOM order — but it states the
                intent, and it keeps the CTAs above anything added later. */}
            <div className="relative z-20 transform-gpu flex h-svh flex-col p-7 pb-6 pt-28 sm:p-12 sm:pb-10 sm:pt-40 lg:p-16 lg:pb-12 lg:pt-[10.5rem] squat:pb-5 squat:pt-[5.5rem] short:pb-6 short:pt-32">
              <div className="min-h-[230px] sm:min-h-[290px] lg:min-h-[320px] squat:min-h-0 short:min-h-0">
                {/* Two blocks, so the break is a decision rather than a wrap
                    that happens to land there at one width. */}
                {/* -ml-[0.07em]: the face's side bearing (4.5px at 64px) set the
                    ink in from the badge and buttons; em-based, so it holds at
                    every clamp size. Same for the intro below. */}
                <h1 className={`-ml-[0.07em] max-w-[720px] font-display text-[clamp(1.75rem,5.4vw,4rem)] squat:text-[1.6rem] short:text-[clamp(1.75rem,min(5.4vw,7.5vh),4rem)] font-600 leading-[1.04] tracking-tighter text-white ${TEXT_SHADOW}`}>
                  {headline.map((line, i) => (
                    <span key={line} className="block">
                      {reduce ? line : <StaggerText text={line} delay={0.1 + i * 0.18} />}
                    </span>
                  ))}
                </h1>
                {/* text-pretty keeps the last line from breaking to a single
                    orphaned word. */}
                <p className={`-ml-[0.07em] mt-5 max-w-[480px] text-pretty text-base leading-relaxed text-white/80 sm:text-lg squat:mt-3 squat:text-[15px] short:mt-3 short:text-base ${TEXT_SHADOW}`}>
                  {intro}
                </p>
              </div>

              {/* Standing claim, not a scroll payoff — it used to fade in
                  with the rear doors at p 0.84, so it never appeared at all
                  on mobile and only briefly on desktop.

                  self-start keeps the pill at its content width instead of
                  stretching across the column the way a flex child would. */}
              {/* Reveal order follows the layout, top to bottom: badge, CTAs,
                  cards. Every one of these reserves its space while it is at
                  opacity 0 — that is what keeps the column from jumping — so
                  the order is what decides whether that space reads as empty.
                  The badge used to arrive last (0.95s) and the cards after
                  the CTAs, which left the buttons floating in a blank band
                  with the badge's slot above them and the cards' below. In
                  document order each item lands directly under one that is
                  already visible. */}
              {/* Bottom row, pushed down by mt-auto. xl and up: badge + CTAs
                  on the left, the cards on the right, centred on one line —
                  the first width where both fit (~560px each side). Below xl
                  the cards drop under the CTAs, right-aligned as before; below
                  sm everything stacks. Vertical spacing between the two
                  groups is gap-y, so it never fights the row's gap-x. */}
              <div className="mt-auto flex flex-col gap-y-1 sm:gap-y-6 short:gap-y-2 xl:flex-row xl:items-center xl:justify-between xl:gap-x-8">
              {/* Badge + CTAs: one wrapping row from sm, so a narrow tablet
                  wraps the buttons under the badge instead of overflowing. */}
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <m.div
                initial={reduce ? undefined : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={uiTransition(0, 0.6)}
                className="mb-4 squat:mb-2 sm:mb-0 inline-flex self-start sm:self-center items-center gap-2.5 rounded-full bg-paper/95 py-2.5 pl-3 pr-4 shadow-lg"
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
                  className="group inline-flex grow basis-auto items-center justify-center gap-2.5 whitespace-nowrap rounded-lg border border-transparent bg-accent px-4 py-3.5 text-sm font-semibold text-ink transition-all duration-300 ease-smooth hover:bg-paper active:scale-[0.98] sm:grow-0 sm:px-7"
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
              </div>

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
              <div className="flex flex-col gap-1 pb-0 sm:ml-auto sm:grid sm:max-w-[620px] sm:grid-cols-3 sm:gap-4 sm:pb-1 xl:min-w-0 xl:flex-1 xl:pb-0">
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
        </div>
    </section>
  );
}
