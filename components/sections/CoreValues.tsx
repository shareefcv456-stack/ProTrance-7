import { coreValues } from "@/lib/site";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";

/** "The Core Four" — company values rendered with a metric per value. */
export function CoreValues() {
  return (
    <section className="relative bg-paper py-24 text-ink sm:py-32">
      <div className="shell">
        <SectionHeading
          theme="light"
          eyebrow="The Core Four"
          title={
            <>
              The principles that keep
              <span className="text-signal-deep"> every wheel turning.</span>
            </>
          }
        />

        <div className="mt-16 grid gap-4 sm:grid-cols-2">
          {coreValues.map((value, i) => (
            <Reveal key={value.title} delay={(i % 2) * 0.1} className="min-w-0">
              <article className="group relative flex h-full items-start gap-5 overflow-hidden rounded-2xl border border-paper-line bg-white/50 p-6 sm:gap-6 sm:p-8 transition-all duration-500 ease-smooth hover:-translate-y-1 hover:border-signal-deep/40 hover:shadow-[0_24px_60px_-30px_rgba(15,22,19,0.35)]">
                {/* metric */}
                <div className="shrink-0">
                  <div className="font-display text-[clamp(2rem,1.6rem+1.1vw,2.75rem)] font-900 tracking-tighter text-signal-deep">
                    {value.metric}
                  </div>
                  <div className="mt-1 font-mono text-[0.55rem] uppercase tracking-widest text-ink/40">
                    {value.metricLabel}
                  </div>
                </div>

                <div className="min-w-0 border-l border-paper-line pl-6">
                  <h3 className="font-display text-lg font-800 leading-tight tracking-tight text-ink">
                    {value.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink/60">
                    {value.body}
                  </p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
