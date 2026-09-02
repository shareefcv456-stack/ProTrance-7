"use client";

import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import type { ImageRef } from "@/lib/images";
import { images } from "@/lib/images";
import { Reveal } from "@/components/motion/Reveal";

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * Photo card that flips on hover to reveal an info face.
 * Pure CSS 3D flip; the global reduced-motion rule collapses it to an
 * instant swap.
 */
function FlipCard({
  image,
  caption,
  sub,
  label,
  title,
  facts,
}: {
  image: ImageRef;
  caption: string;
  sub: string;
  label: string;
  title: string;
  facts: string[];
}) {
  return (
    <div className="group h-full w-full [perspective:1200px]">
      <div className="relative h-full w-full transition-transform duration-700 ease-smooth [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)]">
        {/* Photo face */}
        <div className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_30px_60px_-30px_rgba(39,39,39,0.6)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden]">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(min-width: 640px) 340px, 70vw"
            className="object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/80 to-transparent p-5">
            <span className="block font-display text-sm font-600 text-white">
              {caption}
            </span>
            <span className="mt-0.5 block text-xs text-white/70">{sub}</span>
          </div>
        </div>

        {/* Info face (pre-rotated) */}
        <div className="absolute inset-0 flex flex-col justify-between overflow-hidden rounded-2xl bg-ink p-6 text-paper shadow-[0_30px_60px_-30px_rgba(39,39,39,0.6)] [-webkit-backface-visibility:hidden] [backface-visibility:hidden] [transform:rotateY(180deg)] sm:p-7">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            {label}
          </span>
          <div>
            <h3 className="font-display text-xl font-600 tracking-tight text-paper sm:text-2xl">
              {title}
            </h3>
            <ul className="mt-4 divide-y divide-paper/10">
              {facts.map((fact) => (
                <li key={fact} className="py-2.5 text-sm text-grey-400">
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Left narrative + right pair of flip cards that fan apart on scroll. */
export function ColdChainStory() {
  const reduce = useReducedMotion();

  return (
    <section className="py-14 sm:py-20">
      <div className="shell grid items-center gap-14 lg:grid-cols-2">
        {/* Narrative */}
        <div>
          <Reveal>
            <h2 className="max-w-lg font-display text-3xl font-600 leading-[1.06] tracking-tighter sm:text-4xl md:text-[2.8rem]">
              An unbroken cold chain, mile after mile.
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="mt-6 max-w-lg space-y-4 text-base leading-relaxed text-grey-600">
              <p>
                Thermo King-equipped trucks hold a monitored 2–8°C for
                perishable dairy and confectionery, from the loading dock to the
                retail shelf.
              </p>
              <p>
                The same care extends to fragile cargo: biscuits, glass-bottled
                cosmetics, and delicate gift packs travel under handling
                protocols designed for them.
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.18}>
            <Link
              href="/services"
              className="group mt-8 inline-flex items-center gap-2.5 text-sm font-semibold text-ink transition-colors duration-300 hover:text-accent-deep"
            >
              Explore services
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/[0.06] transition-all duration-300 ease-smooth group-hover:bg-accent group-hover:text-ink">
                <svg
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
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
              </span>
            </Link>
          </Reveal>
        </div>

        {/* Fanned flip cards */}
        <div className="relative mx-auto h-[320px] w-full max-w-[320px] sm:h-[460px] sm:max-w-[460px]">
          {/* Back card — rotates out as the section enters */}
          <motion.div
            initial={reduce ? { rotate: 10, x: 24 } : { rotate: 0, x: 0 }}
            whileInView={{ rotate: 10, x: 24 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.9, delay: 0.15, ease }}
            className="absolute right-14 top-3 z-0 h-[88%] w-[72%] origin-bottom-right hover:z-30 sm:right-0"
          >
            <FlipCard
              image={images.warehouseRacking}
              caption="Cold storage handling"
              sub="Warehouse to shelf, intact"
              label="Careful handling"
              title="Fragile-safe protocols"
              facts={[
                "Biscuits and confectionery",
                "Glass-bottled cosmetics",
                "Delicate gift packs",
              ]}
            />
          </motion.div>

          {/* Front card */}
          <Reveal className="absolute bottom-0 left-0 z-10 h-[88%] w-[72%] hover:z-30">
            <FlipCard
              image={images.reeferDusk}
              caption="Refrigerated transport"
              sub="Monitored 2–8°C, dairy grade"
              label="Cold chain"
              title="Refrigerated transport"
              facts={[
                "Thermo King units",
                "2–8°C monitored setpoint",
                "Dairy-grade handling",
              ]}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
