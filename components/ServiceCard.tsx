"use client";

import { m, useReducedMotion } from "framer-motion";

type Service = {
  id: string;
  title: string;
  short: string;
  body: string;
  tag: string;
};

/**
 * Service card for the light "editorial" bands. On hover the accent bar grows,
 * the index slides, and the card lifts — a restrained, premium micro-interaction.
 */
export function ServiceCard({
  service,
  index,
  theme = "light",
}: {
  service: Service;
  index: number;
  theme?: "light" | "dark";
}) {
  const reduce = useReducedMotion();
  const light = theme === "light";

  return (
    <m.article
      initial={reduce ? {} : { opacity: 0, y: 24 }}
      whileInView={reduce ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }}
      transition={{ duration: 0.6, delay: (index % 3) * 0.08, ease: [0.16, 1, 0.3, 1] }}
      // The lift belongs to framer, which already owns this element's
      // transform. A CSS `hover:-translate-y` lost to framer's inline
      // `transform: none`, and `transition-all` re-smoothed every transform
      // framer wrote during the entrance, so the reveal trailed ~0.5s late.
      whileHover={reduce ? undefined : { y: -6, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border p-7 transition-[border-color,box-shadow] duration-500 ease-smooth ${
        light
          ? "border-paper-line bg-white/60 hover:border-signal-deep/40 hover:shadow-[0_24px_60px_-30px_rgba(15,22,19,0.35)]"
          : "border-asphalt-line bg-asphalt-soft/40 hover:border-signal/40"
      }`}
    >
      {/* growing accent bar */}
      <span
        className={`absolute left-0 top-8 h-8 w-1 origin-top rounded-r bg-signal transition-all duration-500 ease-smooth group-hover:h-16`}
      />

      <div className="flex items-start justify-between">
        <span
          className={`font-mono text-[0.6rem] uppercase tracking-[0.2em] ${
            light ? "text-signal-deep" : "text-signal"
          }`}
        >
          {service.tag}
        </span>
        <span
          className={`font-mono text-xs transition-transform duration-500 group-hover:-translate-y-1 ${
            light ? "text-ink/25" : "text-paper/25"
          }`}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>

      <h3
        className={`mt-6 font-display text-xl font-800 leading-tight tracking-tight ${
          light ? "text-ink" : "text-paper"
        }`}
      >
        {service.title}
      </h3>

      <p
        className={`mt-3 flex-1 text-sm leading-relaxed ${
          light ? "text-ink/60" : "text-paper/55"
        }`}
      >
        {service.body}
      </p>

      <div
        className={`mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider ${
          light ? "text-ink/40" : "text-paper/40"
        }`}
      >
        <span className="transition-colors duration-300 group-hover:text-signal">
          {service.short}
        </span>
      </div>
    </m.article>
  );
}
