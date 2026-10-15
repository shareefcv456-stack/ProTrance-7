import type { Metadata } from "next";
import { HomeHero } from "@/components/home/HomeHero";
import { ServiceRows } from "@/components/home/ServiceRows";
import { FleetStory } from "@/components/home/FleetStory";
import { ColdChainStory } from "@/components/home/ColdChainStory";
import { TrustedPartners } from "@/components/home/TrustedPartners";
import { CoreFour } from "@/components/home/CoreFour";
import { WhyRows } from "@/components/home/WhyRows";
import { ContactSection } from "@/components/home/ContactSection";
import { company, siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** Organization structured data, built only from the facts in lib/site. */
const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: company.name,
  url: siteUrl,
  logo: `${siteUrl}/logo.png`,
  email: company.email,
  telephone: company.phones.office.map((n) => `+91 ${n}`),
  foundingDate: company.founded,
  founder: company.founders.map((name) => ({ "@type": "Person", name })),
  address: {
    "@type": "PostalAddress",
    streetAddress: `${company.hq.line}, Andiyoorkunnu P.O`,
    addressLocality: "Malappuram",
    addressRegion: "Kerala",
    postalCode: company.hq.pin,
    addressCountry: "IN",
  },
  areaServed: "IN",
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <HomeHero />
      <ServiceRows />
      <FleetStory />
      <ColdChainStory />
      <TrustedPartners />
      <CoreFour />
      <WhyRows />
      <ContactSection />
    </>
  );
}
