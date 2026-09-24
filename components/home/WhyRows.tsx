"use client";

import { useState } from "react";
import Image from "next/image";
import { m, useReducedMotion } from "framer-motion";
import { advantages } from "@/lib/site";
import { images } from "@/lib/images";

const ease = [0.22, 1, 0.36, 1] as const;

/** One supporting image per advantage, in the same order as `advantages`. */
const rowImages = [
  images.warehousePackages, // FMCG Specialization
  images.truckHighwayFront, // Interstate Expertise
  images.warehouseRacking, // Scalability
  images.dockBays, // Safety First
  images.boxesMinimal, // Specialized Handling
];

/** Diagonal arrow: points up-right when open, rotates to down-right when closed. */
function DiagArrow({ open }: { open: boolean }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center text-paper transition-transform duration-500 ease-smooth ${
        open ? "" : "rotate-90"
      } group-hover:translate-x-0.5 group-hover:-translate-y-0.5`}
    >
      <svg
        className="h-5 w-5 sm:h-6 sm:w-6"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7 17 17 7M9 7h8v8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * Advantages as a one-open-at-a-time accordion beside a large rounded image.
 * The image crossfades to the open row's photo; all frames stay mounted and
 * preloaded so switching never waits on a fetch.
 */
export function WhyRows() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  return (
    <section className="overflow-x-clip bg-[#101010] py-14 sm:py-20">
      <div className="shell">
        {/* Header */}
        <m.span
          initial={reduce ? undefined : { opacity: 0, y: -16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.6, ease }}
          className="eyebrow block text-accent"
        >
          Why us
        </m.span>
        <m.h2
          initial={reduce ? undefined : { opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.8, delay: 0.1, ease }}
          className="mt-5 max-w-[720px] font-display text-[clamp(1.5rem,1.15rem+2.1vw,3rem)] font-600 uppercase leading-[1.08] tracking-tighter text-paper"
        >
          A partner that speaks <span className="text-accent">FMCG.</span>
        </m.h2>
        <m.p
          initial={reduce ? undefined : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-15% 0px" }}
          transition={{ duration: 0.7, delay: 0.3, ease }}
          className="mt-5 max-w-[560px] text-base leading-relaxed text-grey-400"
        >
          We understand shelf-life, festival peaks, and border paperwork,
          because that is the world we were built for.
        </m.p>

        {/* Two-column: image left, accordion right */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:items-center lg:gap-14">
          <m.div
            initial={reduce ? undefined : { opacity: 0, x: -60, rotate: -2 }}
            whileInView={{ opacity: 1, x: 0, rotate: 0 }}
            viewport={{ once: true, margin: "-15% 0px" }}
            transition={{ duration: 1, ease }}
            className="group relative aspect-[4/3] overflow-hidden rounded-[24px] sm:aspect-[16/10] sm:rounded-[28px] lg:aspect-[4/5] lg:max-h-[440px]"
          >
            {rowImages.map((img, i) => (
              <div
                key={img.src}
                aria-hidden={active !== i}
                className={`absolute inset-0 transition-opacity duration-500 ease-smooth ${
                  active === i ? "opacity-100" : "opacity-0"
                }`}
              >
                <Image
                  src={img.src}
                  alt={active === i ? img.alt : ""}
                  fill
                  // The frame is capped at 440px tall at 4:5 from lg, so never wider than 352px.
                  sizes="(min-width: 1024px) 352px, 100vw"
                  className="object-cover transition-transform duration-500 ease-smooth group-hover:scale-[1.02]"
                />
              </div>
            ))}
          </m.div>

          {/* Accordion */}
          <ul>
            {advantages.map((adv, i) => {
              const open = active === i;
              const [first, ...rest] = adv.title.split(" ");
              return (
                <m.li
                  key={adv.title}
                  initial={reduce ? undefined : { opacity: 0, x: 40 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-10% 0px" }}
                  transition={{ duration: 0.6, delay: 0.15 * i, ease }}
                  className={`border-b border-[#2A2A2A] transition-colors duration-300 hover:border-accent/50 ${
                    i === 0 ? "border-t" : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    onMouseEnter={() => setActive(i)}
                    aria-expanded={open}
                    className="group flex w-full items-center justify-between gap-6 py-5 text-left transition-transform duration-300 ease-smooth hover:translate-x-2 sm:py-6"
                  >
                    <h3 className="font-display text-lg font-600 tracking-tight sm:text-2xl">
                      <span className="text-accent">{first}</span>
                      {rest.length > 0 && (
                        <span className="text-paper"> {rest.join(" ")}</span>
                      )}
                    </h3>
                    <DiagArrow open={open} />
                  </button>
                  <div
                    className={`grid transition-[grid-template-rows] duration-500 ease-smooth ${
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <p
                        className={`max-w-[520px] pb-5 text-sm leading-relaxed text-grey-400 transition-opacity duration-300 sm:pb-6 sm:text-[15px] ${
                          open ? "opacity-100" : "opacity-0"
                        }`}
                      >
                        {adv.body}
                      </p>
                    </div>
                  </div>
                </m.li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
