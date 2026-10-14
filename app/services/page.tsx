import type { Metadata } from "next";
import { services } from "@/lib/site";
import { images } from "@/lib/images";
import { PageHero } from "@/components/ui/PageHero";
import { ServiceCard } from "@/components/ServiceCard";
import { DistributionFlow } from "@/components/sections/DistributionFlow";
import { ColdChainFeature } from "@/components/sections/ColdChainFeature";
import { CtaBand } from "@/components/sections/CtaBand";
import { SectionHeading } from "@/components/ui/SectionHeading";

export const metadata: Metadata = {
  alternates: { canonical: "/services" },
  title: "Services",
  description:
    "Ten FMCG-focused logistics services — cold chain, fragile handling, express replenishment, reverse logistics, real-time tracking, and interstate compliance.",
};

export default function ServicesPage() {
  return (
    <>
      <PageHero
        index="SVC / 06"
        eyebrow="Capabilities"
        title="Services built for FMCG"
        intro="Core specialised services covering the full FMCG journey — from the factory floor to the retail shelf, with speed, safety, and reliability at every stage."
        image={images.dockBays}
      />

      {/* Full services grid */}
      <section className="relative bg-paper py-24 sm:py-28">
        <div className="shell">
          <SectionHeading
            theme="light"
            eyebrow="Core Services"
            title={
              <>
                Everything you need to move
                <span className="text-signal-deep"> fast-moving goods.</span>
              </>
            }
          />
          <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {services.slice(0, 6).map((service, i) => (
              <ServiceCard
                key={service.id}
                service={service}
                index={i}
                theme="light"
              />
            ))}
          </div>
        </div>
      </section>

      <DistributionFlow />
      <ColdChainFeature />
      <CtaBand />
    </>
  );
}
