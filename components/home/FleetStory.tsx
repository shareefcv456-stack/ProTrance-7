import Image from "next/image";
import { fleet } from "@/lib/site";
import { Reveal } from "@/components/motion/Reveal";

const facts = [
  { v: "Ashok Leyland", l: "Primary fleet" },
  { v: "Thermo King", l: "Cold-chain units" },
  { v: "24/7", l: "GPS tracked" },
  { v: "Pan-India", l: "Coverage" },
];

/** Dark full-width band; a portrait fleet image overlaps its top edge on desktop. */
export function FleetStory() {
  return (
    <section className="px-3 pb-14 pt-8 sm:px-5 sm:pb-16 lg:px-0 lg:pt-20">
      <div className="relative mx-auto max-w-[1400px] lg:max-w-none">
        {/* Overlapping card with protruding cutout (desktop) */}
        <Reveal className="absolute -top-32 left-0 z-10 hidden w-[380px] lg:block xl:w-[500px]">
          <div className="relative aspect-[3/4]">
            <div className="absolute bottom-[3%] -left-[26%] -right-[69%] -top-[35%]">
              <Image
                src="/images/image-Photoroom (11).png"
                alt="Container reach stacker lifting equipment"
                fill
                sizes="560px"
                className="object-contain object-left-bottom drop-shadow-[0_30px_35px_rgba(39,39,39,0.35)]"
              />
            </div>
          </div>
        </Reveal>

        {/* Dark band */}
        <div className="rounded-2xl bg-[#101010] py-12 text-paper sm:py-16 lg:rounded-none lg:pb-10">
          <div className="px-7 sm:px-12 lg:pl-[52%] lg:pr-16 min-[1400px]:pl-[46%]">
            {/* Mobile banner — spans the band edge-to-edge, cropped to the
                depot's trucks-and-crates band */}
            <div className="relative -mx-7 -mt-12 mb-8 aspect-[16/10] overflow-hidden rounded-t-2xl sm:-mx-12 sm:-mt-16 lg:hidden">
              <Image
                src="/images/840d62125a188e42b8d6a894d08260bb (1).jpg"
                alt="Trucks and packed freight crates staged in a depot at dusk"
                fill
                sizes="100vw"
                className="object-cover object-[center_68%] sm:object-[center_60%]"
              />
            </div>

            <Reveal>
              <span className="eyebrow text-accent">The fleet</span>
              <h2 className="mt-5 max-w-xl font-display text-3xl font-600 leading-[1.06] tracking-tighter text-paper sm:text-4xl md:text-[2.8rem]">
                A modern fleet in constant motion.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-grey-400">
                {fleet.note} Every truck reports position, temperature, and ETA
                around the clock, so your cargo is never out of sight.
              </p>
            </Reveal>

            <Reveal delay={0.12}>
              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-paper/15 pt-8 sm:grid-cols-4">
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
