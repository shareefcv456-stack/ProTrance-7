"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fleet } from "@/lib/site";
import { images } from "@/lib/images";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TreatedImage } from "@/components/ui/TreatedImage";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Operational band spotlighting cold-chain capability. The right panel is a
 * live temperature monitor — the cold-chain story told as telemetry.
 */
export function ColdChainFeature() {
  return (
    <section className="relative overflow-hidden bg-paper py-24 sm:py-32">
      <div className="pointer-events-none absolute right-0 top-1/3 h-96 w-96 rounded-full bg-signal/10 blur-[130px]" />

      <div className="shell grid items-center gap-14 lg:grid-cols-2">
        <div className="min-w-0">
          <SectionHeading
          theme="light"
            eyebrow="Cold Chain · Zero Compromise"
            title={
              <>
                An unbroken cold chain,
                <span className="text-signal"> monitored mile by mile.</span>
              </>
            }
            intro="Thermo King-equipped trucks hold a steady, monitored temperature for perishable dairy and confectionery — so freshness arrives intact, every time."
          />

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-paper-line bg-paper-line sm:grid-cols-2">
            {[
              { k: "Fleet Brand", v: fleet.brand, sub: "Modern, reliable trucks" },
              { k: "Cold Units", v: "Thermo King", sub: "Refrigerated transport" },
              { k: "Temp Range", v: "2–8°C", sub: "Dairy-grade monitoring" },
              { k: "Visibility", v: "24/7 GPS", sub: "Live ETA & telemetry" },
            ].map((row) => (
              <div key={row.k} className="bg-white/60 p-5">
                <div className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-ink/40">
                  {row.k}
                </div>
                <div className="mt-2 font-display text-lg font-800 tracking-tight text-ink">
                  {row.v}
                </div>
                <div className="mt-1 text-xs text-ink/50">{row.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <Reveal delay={0.15} className="min-w-0 space-y-4">
          <TreatedImage
            image={images.reeferDusk}
            overlay="duotone"
            className="aspect-[16/9] w-full"
            sizes="(min-width: 1024px) 45vw, 100vw"
          />
          <TempMonitor />
        </Reveal>
      </div>
    </section>
  );
}

function TempMonitor() {
  const reduce = useReducedMotion();
  // A gentle, in-range temperature waveform.
  const points = [4.1, 4.4, 3.9, 4.2, 4.6, 4.0, 3.8, 4.3, 4.1, 4.5, 3.9, 4.2];
  const w = 320;
  const h = 150;
  const max = 8;
  const min = 0;
  const step = w / (points.length - 1);
  const toY = (t: number) => h - ((t - min) / (max - min)) * h;
  const d = points
    .map((t, i) => `${i === 0 ? "M" : "L"} ${i * step} ${toY(t)}`)
    .join(" ");

  return (
    <div className="relative overflow-hidden rounded-2xl border border-paper-line bg-white/60 p-6">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-75 [animation:pulse-ring_2.4s_ease-out_infinite]" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
          </span>
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.2em] text-ink/70">
            Reefer · Cabin 01
          </span>
        </div>
        <span className="chip">IN RANGE</span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="font-display text-[clamp(2rem,1.6rem+1.1vw,2.75rem)] font-900 tracking-tighter text-ink">
            +4.2°C
          </div>
          <div className="mt-1 font-mono text-[0.62rem] uppercase tracking-widest text-ink/45">
            Setpoint 2–8°C
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-800 text-ink">98%</div>
          <div className="font-mono text-[0.58rem] uppercase tracking-widest text-ink/45">
            Humidity OK
          </div>
        </div>
      </div>

      {/* waveform */}
      <div className="relative mt-6">
        {/* safe band */}
        <div className="absolute inset-x-0 top-[28%] h-[44%] rounded bg-cold/5 ring-1 ring-inset ring-cold/15" />
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="relative h-[150px] w-full"
          fill="none"
          preserveAspectRatio="none"
        >
          <motion.path
            d={d}
            stroke="#FF5B29"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.8, ease: "easeInOut" }}
          />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-paper-line pt-4 font-mono text-[0.6rem] uppercase tracking-wider text-ink/50">
        <span>Door · Sealed</span>
        <span className="text-center">Fuel · 74%</span>
        <span className="text-right text-signal">GPS · Locked</span>
      </div>
    </div>
  );
}
