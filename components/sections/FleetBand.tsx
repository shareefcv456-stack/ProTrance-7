import Image from "next/image";
import type { ImageRef } from "@/lib/images";
import { Reveal } from "@/components/motion/Reveal";

type Stat = { v: string; l: string };

/**
 * Full-bleed cinematic image band — the site's photographic "hero moment".
 * A treated freight image carries an overlaid statement and telemetry-style
 * stat row, keeping the premium, data-driven tone.
 */
export function FleetBand({
  image,
  eyebrow,
  title,
  accent,
  stats,
}: {
  image: ImageRef;
  eyebrow: string;
  title: React.ReactNode;
  accent?: React.ReactNode;
  stats: Stat[];
}) {
  return (
    <section className="relative isolate overflow-hidden bg-[#131313] py-28 sm:py-36">
      {/* background image */}
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes="100vw"
        className="object-cover"
      />
      {/* layered overlays for legibility + cohesion */}
      <div className="absolute inset-0 bg-[#131313]/40 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#131313] via-[#131313]/80 to-[#131313]/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#131313] via-transparent to-[#131313]/60" />
      <div className="absolute inset-0 grid-lines opacity-20" />

      <div className="shell relative">
        <Reveal>
          <span className="eyebrow text-signal">{eyebrow}</span>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="mt-6 max-w-3xl font-display text-[clamp(1.55rem,1.2rem+2.05vw,3rem)] font-900 uppercase leading-[1.06] tracking-tightest text-paper">
            {title} {accent}
          </h2>
        </Reveal>

        <Reveal delay={0.16}>
          <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-8 border-t border-paper/15 pt-8 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.l}>
                <dt className="font-display text-2xl font-800 tracking-tight text-paper sm:text-3xl">
                  {s.v}
                </dt>
                <dd className="mt-1.5 font-mono text-[0.58rem] uppercase tracking-wider text-paper/50">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </div>
    </section>
  );
}
