import type { Metadata } from "next";
import { company, fleet } from "@/lib/site";
import { images } from "@/lib/images";
import { PageHero } from "@/components/ui/PageHero";
import { MissionVision } from "@/components/sections/MissionVision";
import { FleetBand } from "@/components/sections/FleetBand";
import { CoreValues } from "@/components/sections/CoreValues";
import { ClientsStrip } from "@/components/sections/ClientsStrip";
import { CtaBand } from "@/components/sections/CtaBand";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TreatedImage } from "@/components/ui/TreatedImage";
import { Reveal } from "@/components/motion/Reveal";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Founded in 2024 in Malappuram, PRO TRANS LOGISTICS LLP is redefining FMCG logistics across South India with a modern, trackable Ashok Leyland fleet.",
};

export default function AboutPage() {
  return (
    <>
      <PageHero
        index="ABT / 24"
        eyebrow="Who We Are"
        title="A new standard for FMCG logistics"
        intro="Founded in 2024 and headquartered in Malappuram, PRO TRANS Logistics was built to bridge the gap between manufacturers and markets — with technology, transparency, and an unwavering focus on the goods we carry."
        image={images.portAerial}
      />

      {/* Story + founders */}
      <section className="relative bg-paper py-24 sm:py-32">
        <div className="shell grid gap-14 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <SectionHeading
              theme="light"
              eyebrow="Our Story"
              title={
                <>
                  Born from the demands of
                  <span className="text-signal"> modern retail.</span>
                </>
              }
            />
            <div className="mt-8 space-y-5 text-base leading-relaxed text-ink/65">
              <p>
                India&apos;s consumer brands move faster than ever. Shelves empty
                overnight, festivals spike demand, and perishable cargo has no
                patience for delay. PRO TRANS was founded to meet that reality
                head-on.
              </p>
              <p>
                Anchored in the South Indian market with Pan-India connectivity,
                we combine a modern {fleet.brand} fleet with real-time tracking
                and deep FMCG expertise — so manufacturers can promise
                availability and actually keep it.
              </p>
            </div>

            <Reveal delay={0.1}>
              <TreatedImage
                image={images.truckTankerAutumn}
                overlay="duotone"
                className="mt-10 aspect-[16/10] w-full"
                sizes="(min-width: 1024px) 55vw, 100vw"
              />
            </Reveal>
          </div>

          {/* Founders + facts */}
          <Reveal delay={0.15}>
            <div className="rounded-3xl border border-paper-line bg-white/50 p-8">
              <span className="eyebrow text-signal">Leadership</span>
              <ul className="mt-6 space-y-5">
                {company.founders.map((name, i) => (
                  <li
                    key={name}
                    className="flex items-center gap-4 border-b border-paper-line pb-5 last:border-0 last:pb-0"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-signal/10 font-display text-sm font-800 text-signal">
                      0{i + 1}
                    </span>
                    <div>
                      <div className="font-display text-base font-700 tracking-tight text-ink">
                        {name}
                      </div>
                      <div className="font-mono text-[0.6rem] uppercase tracking-widest text-ink/45">
                        Co-Founder
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line">
                {[
                  { k: "Founded", v: company.founded },
                  { k: "Industry", v: "FMCG" },
                  { k: "HQ", v: "Malappuram" },
                  { k: "Reach", v: "Pan-India" },
                ].map((f) => (
                  <div key={f.k} className="bg-white/70 p-3 sm:p-4">
                    <dt className="font-mono text-[0.55rem] uppercase tracking-widest text-ink/40">
                      {f.k}
                    </dt>
                    <dd className="mt-1 font-display text-sm font-800 tracking-tight text-ink sm:text-base">
                      {f.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </section>

      <MissionVision />

      <FleetBand
        image={images.containerShip}
        eyebrow="Bridging Manufacturers & Markets"
        title="From South India to"
        accent={<span className="text-signal">every corner of the country.</span>}
        stats={[
          { v: "2024", l: "Founded" },
          { v: "FMCG", l: "Specialisation" },
          { v: "3", l: "Marquee clients" },
          { v: "Pan-India", l: "Connectivity" },
        ]}
      />

      {/* Fleet spotlight */}
      <section className="relative overflow-hidden bg-paper py-24 text-ink sm:py-32">
        <div className="shell">
          <div className="grid items-center gap-14 lg:grid-cols-2">
            <SectionHeading
              theme="light"
              eyebrow="The Fleet"
              title={
                <>
                  Modern trucks, modern
                  <span className="text-signal-deep"> telemetry.</span>
                </>
              }
              intro={fleet.note}
            />
            <Reveal delay={0.15}>
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { k: "Primary Brand", v: fleet.brand, d: "Reliable, high-capacity trucks" },
                  { k: "Cold Chain", v: "Thermo King", d: "Refrigerated, monitored units" },
                  { k: "Tracking", v: "24/7 GPS", d: "Live location & ETA" },
                  { k: "Load Types", v: "Diverse", d: "Fragile to bulk perishable" },
                ].map((f) => (
                  <div
                    key={f.k}
                    className="group rounded-2xl border border-paper-line bg-white/60 p-6 transition-all duration-500 hover:-translate-y-1 hover:border-signal-deep/40"
                  >
                    <div className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-signal-deep">
                      {f.k}
                    </div>
                    <div className="mt-3 font-display text-xl font-800 tracking-tight text-ink">
                      {f.v}
                    </div>
                    <div className="mt-1 text-xs text-ink/55">{f.d}</div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <CoreValues />
      <ClientsStrip />
      <CtaBand />
    </>
  );
}
