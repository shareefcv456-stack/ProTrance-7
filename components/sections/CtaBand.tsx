import Link from "next/link";
import Image from "next/image";
import { company } from "@/lib/site";
import { images } from "@/lib/images";
import { Reveal } from "@/components/motion/Reveal";

/** Closing conversion band with the tagline and primary contact routes. */
export function CtaBand() {
  return (
    <section className="relative isolate overflow-hidden bg-paper py-24 sm:py-32">
      <Image
        src={images.roadForest.src}
        alt={images.roadForest.alt}
        fill
        sizes="100vw"
        className="object-cover opacity-[0.12]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-paper via-paper/80 to-paper" />
      <div className="pointer-events-none absolute inset-0 grid-lines opacity-30" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-signal/10 blur-[130px]" />

      <div className="shell relative">
        <div className="relative overflow-hidden rounded-3xl border border-paper-line bg-white/50 px-8 py-16 text-center sm:px-16 sm:py-20">
          {/* hazard corner accents */}
          <div className="hazard absolute left-0 top-0 h-1.5 w-full opacity-80" />

          <Reveal>
            <span className="eyebrow text-signal">Ready When You Are</span>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="mx-auto mt-6 max-w-3xl font-display text-[clamp(1.55rem,1.2rem+2.05vw,3rem)] font-900 uppercase leading-[1.06] tracking-tightest text-ink">
              Let&apos;s keep your shelves{" "}
              <span className="text-signal">stocked.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink/60">
              Tell us what you move and where it needs to be. We&apos;ll design a
              distribution plan around your timelines, your cargo, and your peak
              seasons.
            </p>
          </Reveal>

          <Reveal delay={0.24}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/contact"
                className="group inline-flex items-center gap-2 rounded-xl bg-signal px-8 py-4 text-sm font-semibold text-white shadow-[0_10px_30px_-8px_rgba(255,91,41,0.5)] transition-all duration-300 ease-smooth hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-8px_rgba(255,91,41,0.65)]"
              >
                Start a Conversation
                <svg
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M3 8h9M8 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
              <a
                href={`tel:+91${company.phones.mobile[0]}`}
                className="inline-flex items-center gap-2 rounded-xl border border-paper-line px-8 py-4 text-sm font-semibold text-ink transition-colors duration-300 hover:border-signal hover:text-signal"
              >
                Call +91 {company.phones.mobile[0]}
              </a>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
