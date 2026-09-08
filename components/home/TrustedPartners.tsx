"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/motion/Reveal";

const ease = [0.22, 1, 0.36, 1] as const;

/** Each partner and its proof line — the two faces of one flipping pair. */
const pairs = [
  {
    category: "Retail",
    name: "NESTO Hypermarkets",
    // Official asset is a white knockout; inverted to read on the paper face.
    logo: { src: "/logos/nesto.png", w: 465, h: 222, className: "h-12 invert sm:h-14" },
    text: "Managing high-volume retail logistics for one of the fastest-growing retail chains.",
  },
  {
    category: "Craze Biscuits",
    name: "AZCCO Global Venture",
    // Official asset is white-on-transparent; inverted to read on the paper face.
    logo: { src: "/logos/azcco.png", w: 216, h: 70, className: "h-9 invert sm:h-11" },
    text: "Timely distribution of confectionery products across the network.",
  },
  {
    category: "Dairy Federation",
    name: "MILMA",
    logo: { src: "/logos/milma.svg", w: 263, h: 177, className: "h-[72px] sm:h-[88px]" },
    text: "Trusted handling of sensitive dairy products requiring strict timeline adherence.",
  },
];

/**
 * Grid cells in checkerboard order: which pair sits in each cell and which
 * face shows first. The partner face is paper, the text face is ink, so the
 * checkerboard pattern is preserved and inverts on every flip.
 */
const cells = [
  { pair: 0, partnerFirst: true },
  { pair: 0, partnerFirst: false },
  { pair: 1, partnerFirst: false },
  { pair: 1, partnerFirst: true },
  { pair: 2, partnerFirst: true },
  { pair: 2, partnerFirst: false },
];

function PartnerFace({
  category,
  name,
  logo,
  back,
}: {
  category: string;
  name: string;
  logo: { src: string; w: number; h: number; className: string };
  back?: boolean;
}) {
  return (
    <div
      className={`absolute inset-0 flex flex-col justify-center rounded-2xl bg-paper px-6 text-ink [-webkit-backface-visibility:hidden] [backface-visibility:hidden] sm:px-9 ${
        back ? "[transform:rotateX(180deg)]" : ""
      }`}
    >
      <span className="text-xs text-grey-600 sm:text-sm">{category}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logo.src}
        alt={name}
        width={logo.w}
        height={logo.h}
        loading="lazy"
        decoding="async"
        className={`mt-3 w-auto max-w-full self-start object-contain object-left ${logo.className}`}
      />
    </div>
  );
}

function TextFace({ text, back }: { text: string; back?: boolean }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col justify-center rounded-2xl bg-ink px-6 [-webkit-backface-visibility:hidden] [backface-visibility:hidden] sm:px-9 ${
        back ? "[transform:rotateX(180deg)]" : ""
      }`}
    >
      <p className="text-xs leading-relaxed text-grey-400 sm:text-sm">{text}</p>
    </div>
  );
}

export function TrustedPartners() {
  const reduce = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const section = useRef<HTMLElement>(null);

  // The flip runs on a timer, and a timer does not care whether anyone can
  // see it: unguarded, six cards in `preserve-3d` were re-composited every
  // five seconds for the whole life of the page, including the entire time
  // the WebGL hero is on screen competing for the same GPU. The observer
  // costs one callback per crossing and stops the interval the rest of the
  // time. The animation itself is untouched.
  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let id: ReturnType<typeof setInterval> | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && id === undefined) {
          id = setInterval(() => setFlipped((f) => !f), 5000);
        } else if (!e.isIntersecting && id !== undefined) {
          clearInterval(id);
          id = undefined;
        }
      },
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (id !== undefined) clearInterval(id);
    };
  }, []);

  return (
    <section ref={section} className="relative py-12 sm:py-16">
      {/* Same photograph as the hero, and deliberately the same `sizes` and
          `quality`: that resolves to the identical /_next/image URL, so this
          full-bleed backdrop is a cache hit rather than a second download of
          a 100vw photo. It also sits under bg-ink/80, where nothing finer
          would survive anyway. */}
      <Image
        src="/hero.jpg"
        alt=""
        aria-hidden
        fill
        quality={68}
        sizes="(min-width: 1400px) 1320px, 100vw"
        className="object-cover"
      />
      {/* Dark overlay for text legibility over the photo */}
      <div className="absolute inset-0 bg-ink/80" />
      <div className="shell relative grid items-center gap-12 lg:grid-cols-[minmax(0,560px)_1fr] lg:gap-16">
        {/* Checkerboard of auto-flipping pair cards */}
        <div className="grid grid-cols-2 gap-[5px]">
          {cells.map((cell, i) => {
            const pair = pairs[cell.pair];
            return (
              <motion.div
                key={i}
                initial={reduce ? undefined : { opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true, margin: "-10% 0px" }}
                transition={{ duration: 0.55, delay: i * 0.07, ease }}
                className="h-[150px] [perspective:1200px] sm:h-[190px]"
              >
                <div
                  className={`relative h-full w-full transition-transform duration-700 ease-smooth [transform-style:preserve-3d] ${
                    flipped
                      ? cell.partnerFirst
                        ? "[transform:rotateX(180deg)]"
                        : "[transform:rotateX(-180deg)]"
                      : ""
                  }`}
                >
                  {cell.partnerFirst ? (
                    <>
                      <PartnerFace category={pair.category} name={pair.name} logo={pair.logo} />
                      <TextFace text={pair.text} back />
                    </>
                  ) : (
                    <>
                      <TextFace text={pair.text} />
                      <PartnerFace
                        category={pair.category}
                        name={pair.name}
                        logo={pair.logo}
                        back
                      />
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Narrative — right-aligned, per the wireframe */}
        <div className="lg:ml-auto lg:max-w-[480px] lg:text-right">
          <Reveal>
            <span className="eyebrow text-accent">Trusted partners</span>
            <h2 className="mt-5 font-display text-[clamp(1.5rem,1.15rem+2.1vw,2.8rem)] font-600 leading-[1.1] tracking-tighter text-paper">
              Moving cargo for the brands India shops for.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-grey-400">
              From high-volume retail to temperature-sensitive dairy, leading
              FMCG names rely on our fleet to keep shelves stocked.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
