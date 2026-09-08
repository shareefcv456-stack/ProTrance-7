"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { nav } from "@/lib/site";

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
          className={`mx-auto flex h-14 max-w-shell items-center justify-between rounded-2xl border border-paper-line bg-paper/90 px-3.5 backdrop-blur-md sm:h-16 transition-shadow duration-500 ease-smooth sm:px-6 ${
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

      {/* Mobile menu overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-ink pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] md:hidden"
          >
            {/* top bar: logo + close */}
            <div className="flex h-16 shrink-0 items-center justify-between px-5">
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
                className="-mr-2 flex h-11 w-11 items-center justify-center text-paper/70 transition-colors duration-300 hover:text-paper"
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

            {/* centered links + call line + CTA */}
            <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6 pb-16">
              <nav className="flex flex-col items-center gap-7">
                {nav.map((item, i) => (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.06 + i * 0.06, duration: 0.4 }}
                  >
                    <Link
                      href={item.href}
                      className="font-display text-3xl font-600 tracking-tight text-paper transition-colors duration-300 hover:text-accent"
                    >
                      {item.label}
                    </Link>
                  </motion.div>
                ))}
              </nav>

              {/* No phone number anywhere in the navbar, the mobile menu
                  included. The numbers live on the contact page and in the
                  footer. The CTA keeps the delay the phone line used to hold,
                  so the stagger reads the same. */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.36, duration: 0.4 }}
              >
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-lg bg-accent px-8 py-3.5 text-sm font-semibold text-ink transition-transform duration-300 active:scale-[0.98]"
                >
                  Contact us
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
