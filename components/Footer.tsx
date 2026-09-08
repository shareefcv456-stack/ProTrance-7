import Link from "next/link";
import { company, nav, services } from "@/lib/site";

const footerServices = services.slice(0, 4);

export function Footer() {
  return (
    <footer className="bg-[#101010] text-paper">
      <div className="shell pb-10 pt-16 sm:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          {/* Brand */}
          <div>
            <Link href="/" className="inline-flex" aria-label="PRO TRANS Logistics home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="PRO TRANS Logistics LLP"
                width={440}
                height={161}
                decoding="async"
                className="h-10 w-auto rounded-[4px]"
              />
            </Link>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-grey-400">
              Technology-driven FMCG transportation across South India with
              Pan-India connectivity. Built on a promise of speed, safety, and
              reliability.
            </p>
          </div>

          {/* Explore */}
          <div>
            <h3 className="font-display text-sm font-600 text-paper">Explore</h3>
            <ul className="mt-5 space-y-1.5">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="inline-flex py-1 text-sm text-grey-400 transition-colors duration-300 hover:text-accent"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-display text-sm font-600 text-paper">Services</h3>
            <ul className="mt-5 space-y-1.5">
              {footerServices.map((s) => (
                <li key={s.id}>
                  <Link
                    href="/services"
                    prefetch={false}
                    className="inline-flex py-1 text-sm text-grey-400 transition-colors duration-300 hover:text-accent"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-display text-sm font-600 text-paper">Reach us</h3>
            <ul className="mt-5 space-y-1.5 text-sm">
              {company.phones.mobile.map((p) => (
                <li key={p}>
                  <a
                    href={`tel:+91${p}`}
                    className="inline-flex py-1 text-grey-400 transition-colors duration-300 hover:text-accent"
                  >
                    +91 {p}
                  </a>
                </li>
              ))}
              <li>
                <a
                  href={`mailto:${company.email}`}
                  className="inline-flex break-all py-1 text-grey-400 transition-colors duration-300 hover:text-accent"
                >
                  {company.email}
                </a>
              </li>
              <li className="pt-1 text-xs leading-relaxed text-grey-500">
                {company.hq.line},
                <br />
                {company.hq.area}, PIN {company.hq.pin}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col gap-3 border-t border-paper/10 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-grey-500">
            © {company.founded}–{new Date().getFullYear()} {company.name}
          </p>
          <p className="text-xs text-grey-500">{company.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
