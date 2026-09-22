"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { company, nav } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock scroll while the mobile menu is open; close it on Escape.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Close menu on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Floating nav card — inset from the page edges, matching the
          rounded-module composition of the home page. */}
      <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4 [padding-left:max(0.75rem,env(safe-area-inset-left))] [padding-right:max(0.75rem,env(safe-area-inset-right))] [padding-top:max(0.75rem,env(safe-area-inset-top))]">
        <div
          className={`mx-auto flex h-14 max-w-shell items-center justify-between rounded-2xl border border-paper-line bg-paper/[0.96] px-3.5 sm:h-16 transition-shadow duration-500 ease-smooth sm:px-6 ${
            scrolled
              ? "shadow-[0_18px_45px_-28px_rgba(39,39,39,0.45)]"
              : "shadow-none"
          }`}
        >
          <Link
            href="/"
            className="flex items-center"
            aria-label="PRO TRANS Logistics home"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="PRO TRANS Logistics LLP"
              width={440}
              height={161}
              decoding="async"
              className="h-8 w-auto rounded-[4px] sm:h-10"
            />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  // Not prefetched: these sit in the viewport at load, so Next
                  // pulls every route's chunk and RSC payload while the hero's
                  // three.js is still streaming. Fetched on click instead.
                  prefetch={false}
                  className={`group relative inline-flex items-center whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors duration-300 lg:px-4 ${
                    active ? "text-ink" : "text-grey-600 hover:text-ink"
                  }`}
                >
                  {item.label}
                  <span
                    className={`absolute inset-x-4 -bottom-0.5 h-0.5 origin-left rounded-full bg-accent transition-transform duration-300 ease-smooth ${
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"
                    }`}
                  />
                </Link>
              );
            })}
          </nav>

          {/* No phone number in the top bar. It sat between the nav and the
              CTA and was the only thing forcing the two apart at 1024–1180,
              where the row went from balanced to crowded. The numbers live in
              the mobile menu, the contact page and the footer. */}
          <div className="hidden items-center md:flex">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-ink lg:px-5 transition-all duration-300 ease-smooth hover:bg-accent-deep hover:text-paper active:scale-[0.98]"
            >
              Contact us
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            onClick={() => setOpen(true)}
            className={`${open ? "hidden" : "flex"} h-10 w-10 flex-col items-center justify-center gap-[5px] md:hidden`}
            aria-label="Open menu"
            aria-expanded={open}
          >
            <span className="h-0.5 w-5 bg-ink" />
            <span className="h-0.5 w-5 bg-ink" />
            <span className="h-0.5 w-5 bg-ink" />
          </button>
        </div>
      </header>

      {/* Mobile menu overlay — a full-height drawer, not a centred cluster.

          The links used to sit in a `flex-1 justify-center` column, which
          put the whole menu in a floating block with ~450px of dead space
          above it and ~600px below on a 390x844 screen: full-bleed dark, but
          reading as a small card stranded in the middle. Everything now
          flows from the top and the footer is pushed down with `mt-auto`, so
          the drawer is filled edge to edge at any handset height. */}
      <AnimatePresence>
        {open && (
          <m.div
            /* Fade plus a short slide down — the drawer arrives from the bar
               it was opened from. Transform and opacity only, so it composites
               on the GPU and never lands on the main thread next to the hero
               canvas. */
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            /* z-[100], not z-50: the header bar is itself z-50, and a drawer
               that merely ties with the thing it covers is one stacking
               change away from rendering behind it.

               bg-ink/95 rather than a blue-black: ink is the palette's own
               dark and the one already behind every other dark section, so
               the drawer reads as the same site. Swap the token here if you
               want it cooler. */
            className="fixed inset-0 z-[100] flex h-full min-h-screen w-full flex-col overflow-y-auto overscroll-contain bg-ink/[0.98] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:hidden"
          >
            {/* Top row: logo left, close right, both on the same 24px gutter
                as everything below. The button keeps a 44px tap target and is
                pulled out by half its padding so the glyph — not the
                invisible hit area — lines up with that gutter. */}
            <div className="flex shrink-0 items-center justify-between px-6 pt-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.png"
                alt="PRO TRANS Logistics LLP"
                width={440}
                height={161}
                decoding="async"
                className="h-8 w-auto rounded-[4px]"
              />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="-mr-2.5 flex h-11 w-11 items-center justify-center text-paper/70 transition-colors duration-300 hover:text-paper active:text-accent"
              >
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Links. Left-aligned on the logo's gutter rather than centred:
                a centred column has no edge to agree with, which is most of
                what made the old menu read as a loose block. */}
            <nav className="mt-10 flex flex-col gap-6 px-6">
              {nav.map((item, i) => {
                const active =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                return (
                  <m.div
                    key={item.href}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 + i * 0.06, duration: 0.4 }}
                  >
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`group flex items-center gap-3 font-display text-[2rem] font-600 leading-none tracking-tight transition-colors duration-300 active:text-accent ${
                        active ? "text-accent" : "text-paper hover:text-accent"
                      }`}
                    >
                      {/* Marks the page you are on, and gives the hover
                          somewhere to travel to on the others. */}
                      <span
                        className={`h-px origin-left bg-accent transition-all duration-300 ease-smooth ${
                          active ? "w-6" : "w-0 group-hover:w-6"
                        }`}
                      />
                      {item.label}
                    </Link>
                  </m.div>
                );
              })}
            </nav>

            {/* Primary action, full width on the same gutter. */}
            <m.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.36, duration: 0.4 }}
              className="mt-10 px-6"
            >
              <Link
                href="/contact"
                className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 text-sm font-semibold text-ink transition-all duration-300 ease-smooth hover:bg-accent-deep hover:text-paper active:scale-[0.98]"
              >
                Contact us
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M3 8h9M8 4l4 4-4 4"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            </m.div>

            {/* Footer. `mt-auto` is what fills the drawer: it absorbs whatever
                height is left over, so a tall handset gets a taller gap here
                instead of a stranded block in the middle. */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.46, duration: 0.4 }}
              className="mt-auto px-6 pb-8 pt-12"
            >
              <div className="h-px w-full bg-paper/10" />
              <a
                href={`mailto:${company.email}`}
                className="mt-6 block text-sm text-grey-500 transition-colors duration-300 hover:text-paper"
              >
                {company.email}
              </a>
              <a
                href={`tel:+91${company.phones.mobile[0]}`}
                className="mt-2 block text-sm text-grey-500 transition-colors duration-300 hover:text-paper"
              >
                +91 {company.phones.mobile[0].slice(0, 5)}{" "}
                {company.phones.mobile[0].slice(5)}
              </a>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </>
  );
}
