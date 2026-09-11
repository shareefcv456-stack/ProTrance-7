import type { ReactNode } from "react";
import Link from "next/link";
import { company, nav, services } from "@/lib/site";

const footerServices = services.slice(0, 4);

/** Column heading.
 *
 * Two typographic treatments, and the `md:` half is the original one
 * verbatim — display face, 14px, paper, sentence case. Below md it becomes
 * the small tracked mono label the rest of the site uses for section
 * eyebrows: at phone width the four headings are the only landmarks in a
 * column of similar-looking links, and making them quieter but crisper
 * separates them faster than making them bigger did. */
function ColumnHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono text-[0.68rem] font-600 uppercase tracking-[0.16em] text-grey-500 md:font-display md:text-sm md:normal-case md:tracking-normal md:text-paper">
      {children}
    </h3>
  );
}

const linkClass =
  "inline-flex py-1 text-sm text-grey-400 transition-colors duration-300 hover:text-accent";

export function Footer() {
  return (
    <footer className="bg-[#101010] text-paper">
      {/* Vertical padding is the mobile half of this change. `.shell` already
          supplies 20px of side padding at phone width, so the horizontal ask
          was met before we got here.

          The bottom pad carries the safe area rather than a flat number: on
          a handset with a home indicator or a browser chrome bar, 40px put
          the address and the copyright underneath it. env() resolves to 0 on
          a desktop browser, so `calc(2.5rem + 0)` is exactly the pb-10 this
          had before — the inset is additive, never a desktop change. */}
      <div className="shell pb-[calc(3rem+env(safe-area-inset-bottom))] pt-10 sm:pb-[calc(2.5rem+env(safe-area-inset-bottom))] sm:pt-20">
        {/* Two columns on a phone, the original four from md.

            The single stack was 1036px — 1.23 phone screens of footer, most
            of it air between four headings. Explore and Services hold four
            short links each and sit side by side comfortably; the brand
            paragraph and the contact block both want the full width, so they
            span. At md every child returns to one column of the original
            1.4/1/1/1.2 track list and `md:gap-12` restores the old gutter. */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-[1.4fr_1fr_1fr_1.2fr] md:gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
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
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-grey-400 md:mt-5">
              Technology-driven FMCG transportation across South India with
              Pan-India connectivity. Built on a promise of speed, safety, and
              reliability.
            </p>
          </div>

          {/* Explore */}
          <div>
            <ColumnHeading>Explore</ColumnHeading>
            <ul className="mt-4 space-y-2.5 md:mt-5 md:space-y-1.5">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} prefetch={false} className={linkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <ColumnHeading>Services</ColumnHeading>
            <ul className="mt-4 space-y-2.5 md:mt-5 md:space-y-1.5">
              {footerServices.map((s) => (
                <li key={s.id}>
                  <Link href="/services" prefetch={false} className={linkClass}>
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="col-span-2 md:col-span-1">
            <ColumnHeading>Reach us</ColumnHeading>
            {/* A wrapping row on a phone, the original stacked list from md.
                Two phone numbers on two lines of their own is two lines spent
                on eleven characters each; side by side with a middot between
                them they read as one "call us on either" line. The email and
                the address take `basis-full`, so each still gets its own row
                — breaking an address across a column boundary is how you get
                half a PIN code on one line.

                `md:block` drops the flex context, which is what lets
                `md:space-y-1.5` apply again and puts every item back on its
                own line exactly as before. */}
            <ul className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm md:mt-5 md:block md:space-y-1.5">
              {company.phones.mobile.map((p, i) => (
                <li key={p} className="flex items-center md:block">
                  {i > 0 && (
                    <span aria-hidden="true" className="mr-3 text-grey-600 md:hidden">
                      ·
                    </span>
                  )}
                  <a
                    href={`tel:+91${p}`}
                    className="inline-flex py-1 text-grey-400 transition-colors duration-300 hover:text-accent"
                  >
                    +91 {p}
                  </a>
                </li>
              ))}
              <li className="basis-full">
                <a
                  href={`mailto:${company.email}`}
                  className="inline-flex break-all py-1 text-grey-400 transition-colors duration-300 hover:text-accent"
                >
                  {company.email}
                </a>
              </li>
              <li className="basis-full pt-1 text-xs leading-relaxed text-grey-500">
                {company.hq.line},
                <br />
                {company.hq.area}, PIN {company.hq.pin}
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col gap-3 border-t border-paper/10 pt-6 sm:mt-14 sm:flex-row sm:items-center sm:justify-between sm:pt-7">
          <p className="text-xs text-grey-500">
            © {company.founded}–{new Date().getFullYear()} {company.name}
          </p>
          <p className="text-xs text-grey-500">{company.tagline}</p>
        </div>
      </div>
    </footer>
  );
}
