"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { StaggerText } from "@/components/motion/StaggerText";

const ease = [0.22, 1, 0.36, 1] as const;

const HeroScene = dynamic(() => import("./HeroScene"), { ssr: false });

/* ── Scroll-driven 3D hero ───────────────────────────────────────────────
   GSAP ScrollTrigger is the single scroll source. It writes to a ref (read
   inside the canvas's useFrame, so scrolling causes no React render) and to
   a MotionValue (so the DOM overlays below can bind with useTransform). */

const chapters = [
  {
    label: "Warehouse",
    sub: "Crates loading at the dock",
    title: "Logistics that keep retail moving.",
    body: "FMCG freight across South India with Pan-India reach. Cold-chain ready, GPS-tracked, and built for retail speed.",
  },
  {
    label: "In transit",
    sub: "Pan-India line haul",
    title: "Sealed at the dock. Tracked to the door.",
    body: "Line haul across the national corridors, every load on GPS and every handover logged against the docket.",
  },
  {
    label: "Coastal run",
    sub: "Coastal corridor, NH-66",
    title: "Cold chain that holds the whole way.",
    body: "Thermo King units running 2–8°C down NH-66, temperature logged end to end — not just at the gate.",
  },
  {
    label: "Yard arrival",
    sub: "Delivered, on time",
    title: "Backed onto the quay, on schedule.",
    body: "Reversed into the bay, doors open, paperwork signed. On-time delivery across India, load after load.",
  },
];

/** Scroll band for chapter `i`: fade in, hold, fade out. The first chapter
    is opaque from the top and the last holds to the end, so the scene never
    drops to bare photo between crossfades. */
const FADE = 0.06;
function band(i: number, n: number): [number[], number[]] {
  const input = [i / n - FADE, i / n + FADE, (i + 1) / n - FADE, (i + 1) / n + FADE];
  if (i === 0) [input[0], input[1]] = [-1, -0.5];
  if (i === n - 1) [input[2], input[3]] = [2, 3];
  return [input, [0, 1, 1, 0]];
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
    <div className="flex h-9 flex-col items-end justify-start">
      <motion.div style={{ opacity }} className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-white">
          {chapters[index].label}
        </span>
        <motion.span style={{ width }} className="h-px bg-accent" />
      </motion.div>
      <motion.span
        style={{ opacity: subOpacity, x: subX }}
        className="mt-1 block text-[10px] leading-none text-white/55"
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
  const scroll = useMotionValue(0);
  // The poster holds until the canvas has drawn a real frame. Fading on a
  // timer instead meant a slow GPU showed an empty canvas washing over the
  // photograph — the one moment the photograph is doing all the work.
  const [painted, setPainted] = useState(false);
  const onReady = useCallback(() => setPainted(true), []);

  useEffect(() => {
    if (reduce) return;
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
  useMotionValueEvent(scroll, "change", (v) => {
    const next = Math.min(chapters.length - 1, Math.max(0, Math.floor(v * chapters.length)));
    setStage((cur) => (cur === next ? cur : next));
  });
  const copy = reduce ? chapters[0] : chapters[stage];

  const badge = useTransform(scroll, [0.84, 0.91], [0, 1]);
  const badgeY = useTransform(scroll, [0.84, 0.91], [14, 0]);

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
      className="relative bg-ink lg:h-[380vh]"
    >
      <div className="lg:sticky lg:top-0">
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
                src="/image.png"
                alt="A PRO TRANS container truck at a port terminal, dock crew loading beside stacked shipping containers"
                fill
                priority
                sizes="(min-width: 1400px) 1320px, 100vw"
                className={`object-cover object-[62%_center] transition-opacity duration-700 ${
                  painted ? "opacity-0" : "opacity-100"
                }`}
              />
              {!reduce && (
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

            {/* Phase 4 status badge — timed to the rear doors opening. */}
            {!reduce && (
              <motion.div
                style={{ opacity: badge, y: badgeY }}
                className="absolute bottom-6 right-6 z-10 hidden items-center gap-2.5 rounded-full bg-paper/95 py-2.5 pl-3 pr-4 shadow-lg backdrop-blur sm:flex"
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
            )}

            {/* Chapter index */}
            {!reduce && (
              <div className="absolute right-6 top-6 z-10 hidden flex-col items-end gap-1 sm:flex">
                {chapters.map((c, i) => (
                  <ChapterTick key={c.label} index={i} progress={scroll} />
                ))}
              </div>
            )}

            {/* Legibility scrim — the copy column sits at full opacity on top
                of it, so nothing in the left column is ever semi-transparent. */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/70 to-transparent" />

            {/* Copy */}
            <div className="relative flex h-screen min-h-[650px] flex-col p-7 pb-8 pt-28 sm:p-12 sm:pb-10 sm:pt-32 lg:p-16 lg:pb-12 lg:pt-32">
              {/* Stage marker, headline and paragraph, all keyed to the same
                  stage so they change together.

                  One h1 and one p in the DOM at a time, with the text swapped
                  rather than four copies stacked and faded: four h1 elements
                  is four headings for a screen reader to walk through, and
                  the outgoing copy stays selectable and searchable while it
                  is invisible. AnimatePresence mode="wait" holds the incoming
                  until the outgoing has gone, so they never overlap. */}
              <div className="min-h-[300px] sm:min-h-[290px] lg:min-h-[320px]">
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
                        className="mb-4 block font-mono text-[11px] uppercase tracking-[0.18em] text-accent"
                        aria-hidden="true"
                      >
                        {String(stage + 1).padStart(2, "0")} — {copy.label}
                      </span>
                    )}
                    <h1 className="max-w-[640px] font-display text-[clamp(2.5rem,5.4vw,4.3rem)] font-600 leading-[1.04] tracking-tighter text-white">
                      {stage === 0 && !reduce ? (
                        <StaggerText text={copy.title} delay={0.1} />
                      ) : (
                        copy.title
                      )}
                    </h1>
                    <p className="mt-6 max-w-[470px] text-base leading-relaxed text-white/80 sm:text-lg">
                      {copy.body}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>


              <motion.div
                initial={reduce ? undefined : { opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.7, ease }}
                className="mt-auto flex flex-wrap items-center gap-3 pt-10"
              >
                <Link
                  href="/contact"
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
                  className="inline-flex items-center rounded-lg border border-white/30 px-7 py-3.5 text-sm font-semibold text-white transition-colors duration-300 ease-smooth hover:border-white/70 hover:bg-white/[0.06]"
                >
                  Explore services
                </Link>
              </motion.div>

              {/* Service cards — one horizontal row pinned under the CTA
                  group, so the canvas centre stays clear of UI. */}
              <div className="grid grid-cols-3 gap-4 pt-10 lg:max-w-[620px]">
                {chips.map((chip, i) => (
                  <motion.div
                    key={chip.title}
                    initial={reduce ? undefined : { opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.65, delay: 0.85 + i * 0.12, ease }}
                    className="flex flex-col rounded-2xl border border-white/12 bg-white/[0.07] p-3.5 backdrop-blur-sm sm:p-5"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-accent sm:h-10 sm:w-10">
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
                    <span className="mt-3 block font-display text-xs font-600 leading-snug text-paper sm:mt-4 sm:text-sm">
                      {chip.title}
                    </span>
                    <span className="mt-1 hidden text-xs leading-relaxed text-grey-300 sm:block">
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
