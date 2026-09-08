import { clients } from "@/lib/site";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Reveal } from "@/components/motion/Reveal";
import { Marquee } from "@/components/ui/Marquee";

// Repeat the Nesto logo enough times to span the viewport for a seamless loop.
const nestoLogos = Array.from({ length: 8 });

/** Esteemed clientele — trust anchors rendered as capability cards. */
export function ClientsStrip() {
  return (
    <section className="relative bg-paper py-24 sm:py-32">
      <div className="shell">
        <SectionHeading
          theme="light"
          eyebrow="Trusted Partners"
          title={
            <>
              Moving cargo for the brands
              <span className="text-signal"> India shops for.</span>
            </>
          }
          intro="From high-volume retail to temperature-sensitive dairy, leading FMCG names rely on our fleet to keep shelves stocked."
        />
      </div>

      {/* Full-bleed auto-scrolling partner logo wall (right → left).
          The strip pauses on hover; each tile lifts and highlights on hover. */}
      <div className="relative mt-14 sm:mt-16">
        {/* edge fades for a premium, un-clipped feel */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent sm:w-40" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent sm:w-40" />

        <Marquee>
          {nestoLogos.map((_, i) => (
            <span
              key={i}
              role="img"
              aria-label="Nesto"
              className="mx-10 h-10 w-[84px] shrink-0 select-none bg-ink/40 transition-all duration-500 ease-smooth hover:scale-110 hover:bg-signal sm:mx-14 sm:h-12 sm:w-[100px]"
              style={{
                WebkitMaskImage: "url('/logos/nesto.png')",
                maskImage: "url('/logos/nesto.png')",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "center",
                maskPosition: "center",
                WebkitMaskSize: "contain",
                maskSize: "contain",
              }}
            />
          ))}
        </Marquee>
      </div>

      <div className="shell">
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {clients.map((client, i) => (
            <Reveal key={client.name} delay={i * 0.1}>
              <article className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-paper-line bg-white/40 p-7 transition-all duration-500 ease-smooth hover:-translate-y-1 hover:border-signal/40">
                {/* hover glow */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-signal/0 blur-3xl transition-all duration-500 group-hover:bg-signal/15" />

                <div className="relative">
                  <span className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-signal">
                    {client.sector}
                  </span>
                  <h3 className="mt-4 font-display text-2xl font-800 tracking-tight text-ink">
                    {client.name}
                  </h3>
                </div>
                <p className="relative mt-8 text-sm leading-relaxed text-ink/55">
                  {client.service}
                </p>

                <div className="relative mt-6 flex items-center gap-2 border-t border-paper-line pt-5">
                  <span className="h-2 w-2 rounded-full bg-signal" />
                  <span className="font-mono text-[0.6rem] uppercase tracking-widest text-ink/45">
                    Active Account
                  </span>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
