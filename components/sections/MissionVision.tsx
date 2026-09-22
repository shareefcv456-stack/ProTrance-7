import { mission, vision } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

/** Mission and Vision presented as a paired, contrasting light/dark spread. */
export function MissionVision() {
  return (
    <section className="relative bg-paper py-24 sm:py-32">
      <div className="shell grid gap-4 md:grid-cols-2">
        {/* Mission — dark card */}
        <Reveal>
          <article className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-paper-line bg-white/50 p-9 sm:p-11">
            <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-signal/20 opacity-50 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />
            <div className="relative">
              <span className="eyebrow text-signal">Our Mission</span>
              <p className="mt-8 font-display text-[clamp(1.15rem,0.95rem+0.55vw,1.4rem)] font-700 leading-[1.4] tracking-tight text-ink">
                {mission}
              </p>
            </div>
            <div className="relative mt-10 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-signal" />
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-ink/45">
                Agile · Transparent · Tech-driven
              </span>
            </div>
          </article>
        </Reveal>

        {/* Vision — cold card */}
        <Reveal delay={0.12}>
          <article className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-cold/20 bg-gradient-to-br from-cold/[0.08] to-transparent p-9 sm:p-11">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cold/20 opacity-50 blur-3xl transition-opacity duration-700 group-hover:opacity-100" />
            <div className="relative">
              <span className="eyebrow text-cold">Our Vision</span>
              <p className="mt-8 font-display text-[clamp(1.15rem,0.95rem+0.55vw,1.4rem)] font-700 leading-[1.4] tracking-tight text-ink">
                {vision}
              </p>
            </div>
            <div className="relative mt-10 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cold" />
              <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-ink/45">
                India&apos;s most trusted logistics partner
              </span>
            </div>
          </article>
        </Reveal>
      </div>
    </section>
  );
}
