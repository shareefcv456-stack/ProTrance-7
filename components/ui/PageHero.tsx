import type { ReactNode } from "react";
import Image from "next/image";
import type { ImageRef } from "@/lib/images";
import { StaggerText } from "@/components/motion/StaggerText";
import { Reveal } from "@/components/motion/Reveal";

/** Shared header for interior pages — dark navy hero matching the home hero. */
export function PageHero({
  index,
  eyebrow,
  title,
  intro,
  image,
}: {
  index: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  image?: ImageRef;
}) {
  return (
    <section className="relative isolate overflow-hidden bg-[#131313] pb-16 pt-36 sm:pb-20 sm:pt-44">
      {image && (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-[70%_center]"
        />
      )}
      {/* Neutral dark gradient — heavy left, softer right */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(19,19,19,0.96)_0%,rgba(19,19,19,0.82)_45%,rgba(19,19,19,0.55)_75%,rgba(19,19,19,0.35)_100%)]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[#131313] via-transparent to-[#131313]/40" />
      <div className="pointer-events-none absolute inset-0 -z-10 grid-lines opacity-[0.15]" />
      <div className="pointer-events-none absolute -right-24 top-20 -z-10 h-80 w-80 rounded-full bg-signal/10 blur-[120px]" />

      <div className="shell relative">
        <Reveal>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-signal">{index}</span>
            <span className="h-px w-8 bg-white/25" />
            <span className="eyebrow text-white/55">{eyebrow}</span>
          </div>
        </Reveal>

        <h1 className="mt-7 max-w-4xl font-display text-[clamp(1.45rem,0.76rem+3.21vw,3rem)] lg:text-[clamp(1.7rem,1.05rem+3.05vw,3.75rem)] font-900 uppercase leading-[0.98] tracking-tightest text-white">
          <StaggerText text={title} delay={0.15} />
        </h1>

        <Reveal delay={0.5}>
          <p className="mt-7 max-w-2xl text-base leading-relaxed text-white/65 sm:text-lg">
            {intro}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
