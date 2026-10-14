import type { Metadata } from "next";
import { company } from "@/lib/site";
import { images } from "@/lib/images";
import { PageHero } from "@/components/ui/PageHero";
import { ContactForm } from "@/components/ContactForm";
import { Reveal } from "@/components/motion/Reveal";

export const metadata: Metadata = {
  alternates: { canonical: "/contact" },
  title: "Contact",
  description:
    "Get in touch with PRO TRANS LOGISTICS LLP — call, email, or send an enquiry. Headquartered at CVM Tower, Malappuram, Kerala.",
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        index="CTA / 01"
        eyebrow="Get in Touch"
        title="Let's move your cargo"
        intro="Whether it's a single time-sensitive run or an ongoing distribution contract, our team is ready. Reach us directly or send an enquiry and we'll respond fast."
        image={images.truckHighwayFront}
      />

      <section className="relative bg-paper py-20 sm:py-28">
        <div className="shell grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          {/* Contact details */}
          <div className="space-y-4">
            <Reveal>
              <span className="eyebrow text-signal">Direct Lines</span>
            </Reveal>

            {/* Phones */}
            <Reveal delay={0.06}>
              <div className="grid gap-4 sm:grid-cols-2">
                <PhoneCard
                  label="Mobile"
                  numbers={company.phones.mobile}
                  accent="signal"
                />
                <PhoneCard
                  label="Office"
                  numbers={company.phones.office}
                  accent="cold"
                />
              </div>
            </Reveal>

            {/* Email */}
            <Reveal delay={0.12}>
              <a
                href={`mailto:${company.email}`}
                className="group flex items-center justify-between rounded-2xl border border-paper-line bg-white/50 p-6 transition-all duration-500 hover:-translate-y-1 hover:border-signal/40"
              >
                <div>
                  <div className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-ink/40">
                    Email
                  </div>
                  <div className="mt-2 break-all font-display text-lg font-700 tracking-tight text-ink">
                    {company.email}
                  </div>
                </div>
                <span className="text-signal transition-transform duration-300 group-hover:translate-x-1">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8h9M8 4l4 4-4 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </a>
            </Reveal>

            {/* Address */}
            <Reveal delay={0.18}>
              <div className="relative overflow-hidden rounded-2xl border border-paper-line bg-white/50 p-6">
                <div className="hazard absolute left-0 top-0 h-1 w-full opacity-70" />
                <div className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-ink/40">
                  Headquarters
                </div>
                <address className="mt-3 not-italic font-display text-lg font-700 leading-snug tracking-tight text-ink">
                  {company.hq.line}
                  <br />
                  {company.hq.area}
                </address>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <span className="chip">PIN · {company.hq.pin}</span>
                  <span className="chip chip-signal">
                    {company.hq.coords}
                  </span>
                </div>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=CVM+Tower+Andiyoorkunnu+Malappuram"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-signal transition-colors hover:text-signal-soft"
                >
                  Open in Maps
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M6 3h7v7M13 3L6 10"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </a>
              </div>
            </Reveal>

            {/* Hours */}
            <Reveal delay={0.24}>
              <div className="flex items-center gap-3 rounded-2xl border border-paper-line bg-white/30 px-6 py-4">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-signal opacity-75 [animation:pulse-ring_2.4s_ease-out_infinite]" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-signal" />
                </span>
                <span className="text-sm text-ink/70">
                  Dispatch & tracking desk —{" "}
                  <span className="font-semibold text-ink">
                    available 24/7
                  </span>
                </span>
              </div>
            </Reveal>
          </div>

          {/* Form */}
          <Reveal delay={0.1}>
            <div>
              <span className="eyebrow text-signal">Send an Enquiry</span>
              <div className="mt-5">
                <ContactForm />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}

function PhoneCard({
  label,
  numbers,
  accent,
}: {
  label: string;
  numbers: readonly string[];
  accent: "signal" | "cold";
}) {
  const dot = accent === "signal" ? "bg-signal" : "bg-signal";
  return (
    <div className="rounded-2xl border border-paper-line bg-white/50 p-6">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-ink/40">
          {label}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {numbers.map((n) => (
          <a
            key={n}
            href={`tel:+91${n}`}
            className="font-display text-lg font-700 tracking-tight text-ink transition-colors hover:text-signal"
          >
            +91 {n}
          </a>
        ))}
      </div>
    </div>
  );
}
