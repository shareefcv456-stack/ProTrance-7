import Image from "next/image";
import { fleet } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

const facts = [
  { v: "Ashok Leyland", l: "Primary fleet" },
  { v: "Thermo King", l: "Cold-chain units" },
  { v: "24/7", l: "GPS tracked" },
  { v: "Pan-India", l: "Coverage" },
];

/** Dark full-width band; a reach stacker stands against its left edge on desktop. */
export function FleetStory() {
  return (
    <section className="px-3 pb-10 pt-6 sm:px-5 sm:pb-12 lg:px-0 lg:pb-16 lg:pt-0">
      {/* One positioning context spanning the headroom the machine breaks into
          *and* the band itself.

          This replaces a stack of tuned percentages — `-top-32` on the wrapper
          plus `-left-[26%] -right-[69%] -top-[35%]` on the frame inside it —
          that existed for one reason: 44.5% of the source PNG was transparent
          padding, so the layout was hunting for the artwork inside a mostly
          empty canvas. Those numbers put the machine's wheels 89px *below* the
          band and its boom 51px above the section, overlapping the cards above.
          The asset is now trimmed to the machine, so `inset-y-0` +
          `object-bottom` grounds it on the band's bottom edge by construction
          and it fills the headroom above rather than leaving it empty.

          The headroom itself is sized to what the boom actually uses at each
          width — the machine is width-bound below 1400, so a flat pt-24 there
          was reserving 96px of blank page above the band for nothing. */}
      <div className="relative mx-auto max-w-[1400px] lg:max-w-none lg:pt-10 xl:pt-14 min-[1400px]:pt-24">
        {/* The reach stacker, md and up: an overlay on the band's left half. */}
        <Reveal className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-[48%] max-w-[600px] px-6 md:block xl:px-12">
          <div className="relative h-full">
            <Image
              src="/images/reach-stacker.png"
              alt="Container reach stacker lifting equipment"
              fill
              sizes="(min-width: 1280px) 504px, calc(48vw - 48px)"
              className="object-contain object-bottom drop-shadow-[0_30px_35px_rgba(39,39,39,0.35)]"
            />
          </div>
        </Reveal>

        {/* Dark band */}
        <div className="rounded-2xl bg-[#101010] text-paper lg:rounded-none">
          <div className="px-7 py-10 sm:px-12 sm:py-12 md:pl-[52%] md:pr-12 lg:py-16 lg:pb-10 lg:pr-16 min-[1400px]:pl-[46%]">
            {/* The reach stacker, below md.
                
                This is where a static depot photograph used to sit — a second,
                unrelated image that appeared only on phones while the machine
                this section is actually about was `hidden lg:block` and never
                rendered below 1024 at all. The photo is gone and the machine
                takes its place, so mobile and desktop show the same subject.

                A separate element from the desktop overlay rather than one
                element with responsive positioning, and deliberately: the
                desktop copy is absolutely positioned against the *outer*
                container so its boom can break out above the band, while this
                one belongs in the band's own flow so it can never land on the
                copy. One element cannot be both. Each is `display:none` at the
                other's widths, so a lazy next/image only ever downloads the
                one that is actually shown. */}
            <Reveal className="relative mb-7 aspect-[905/965] w-[78%] max-w-[290px] md:hidden">
              <Image
                src="/images/reach-stacker.png"
                alt="Container reach stacker lifting equipment"
                fill
                sizes="(min-width: 640px) 290px, 60vw"
                className="object-contain object-bottom drop-shadow-[0_22px_26px_rgba(0,0,0,0.5)]"
              />
            </Reveal>

            <Reveal>
              <span className="eyebrow text-accent">The fleet</span>
              <h2 className="mt-5 max-w-xl font-display text-[clamp(1.5rem,1.2rem+1.9vw,2.5rem)] font-600 leading-[1.08] tracking-tighter text-paper">
                A modern fleet in constant motion.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-grey-400">
                {fleet.note} Every truck reports position, temperature, and ETA
                around the clock, so your cargo is never out of sight.
              </p>
            </Reveal>

            <Reveal delay={0.12}>
              {/* Two columns until there is genuinely room for four. At 1024 the
                  text column is 428px wide, which gave each stat 107px and
                  wrapped "Ashok Leyland" and "Cold-chain units" onto two lines
                  while the short ones sat on one — a ragged row. */}
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper/15 pt-8 sm:gap-x-8 min-[1400px]:grid-cols-4">
                {facts.map((f) => (
                  <div key={f.l}>
                    <dt className="font-display text-lg font-600 tracking-tight text-paper sm:text-xl">
                      {f.v}
                    </dt>
                    <dd className="mt-1 text-xs text-grey-500">{f.l}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
