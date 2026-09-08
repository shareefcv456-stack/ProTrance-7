"use client";

import { useRef } from "react";
import Link from "next/link";
import {
  cubicBezier,
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";

import { coreValues } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

const easeSmooth = cubicBezier(0.22, 1, 0.36, 1);

/**
 * One value card, scroll-driven: it rises from below across its own slice of
 * the section's scroll progress, then locks in place (transforms clamp at the
 * range edges) before the next card's slice begins.
 */
function CoreCard({
  progress,
  index,
  title,
  body,
  reduce,
}: {
  progress: MotionValue<number>;
  index: number;
  title: string;
  body: string;
  reduce: boolean;
}) {
  const start = index * 0.21;
  const y = useTransform(progress, [start, start + 0.24], [110, 0], {
    ease: easeSmooth,
  });
  const opacity = useTransform(progress, [start, start + 0.16], [0, 1]);

  return (
    <div className={index % 2 === 1 ? "xl:translate-y-16" : ""}>
      <motion.div
        style={reduce ? undefined : { y, opacity }}
        className="h-full"
      >
        <article className="relative flex h-full min-h-[320px] flex-col rounded-[24px] bg-[#F2F2F2] p-8 pb-24 transition-all duration-500 ease-smooth hover:-translate-y-1 hover:shadow-[0_28px_55px_-30px_rgba(0,0,0,0.65)] sm:p-9 sm:pb-24">
          <h3 className="max-w-[95%] font-display text-xl font-600 uppercase leading-tight tracking-tight text-[#1A1A1A]">
            {title}
          </h3>
          <p className="mt-4 text-sm leading-relaxed text-[#4A4A4A]">{body}</p>
          <Link
            href="/about"
            className="mt-auto inline-flex w-fit items-center gap-1.5 pt-6 text-xs font-semibold uppercase tracking-[0.1em] text-accent-deep transition-colors duration-300 hover:text-ink"
          >
            Read more
            <svg
              className="h-3.5 w-3.5"
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

          {/* Concave notch carved from the bottom-right corner: a section-bg
            square with a rounded inner corner, plus two fillets curving the
            card's edges into it, and the pagination dot sitting in the gap. */}
          <div
            aria-hidden
            className="absolute bottom-0 right-0 h-[72px] w-[108px] rounded-tl-[28px] bg-[#101010]"
          >
            <span className="absolute -top-6 right-0 h-6 w-6 bg-[radial-gradient(circle_24px_at_0_0,transparent_23px,#101010_24px)]" />
            <span className="absolute -left-6 bottom-0 h-6 w-6 bg-[radial-gradient(circle_24px_at_0_0,transparent_23px,#101010_24px)]" />
            <span className="absolute bottom-2.5 right-4 h-3 w-3 rounded-full bg-white" />
          </div>
        </article>
      </motion.div>
    </div>
  );
}

/** The four company values as a staggered row of notched cards (odd cards sit higher). */
export function CoreFour() {
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: gridRef,
    // Ends at mid-viewport so every card is settled before the section
    // scrolls on into the next one.
    offset: ["start end", "center 0.5"],
  });
  // A soft spring trails the raw scroll position, so the cards glide into
  // place instead of tracking the wheel one-to-one.
  const progress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 1,
  });

  return (
    <section className="bg-[#101010] py-14 sm:py-20">
      <div className="shell">
        <Reveal>
          <div className="mx-auto max-w-xl text-center">
            <h2 className="font-display text-[clamp(1.5rem,1.15rem+2.1vw,2.8rem)] font-600 leading-[1.1] tracking-tighter text-paper">
              The Core Four.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-grey-400 sm:text-lg">
              The principles behind every dispatch we run.
            </p>
          </div>
        </Reveal>

        <div
          ref={gridRef}
          className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4 xl:pb-16"
        >
          {coreValues.map((value, i) => (
            <CoreCard
              key={value.title}
              progress={progress}
              index={i}
              title={value.title}
              body={value.body}
              reduce={!!reduce}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
