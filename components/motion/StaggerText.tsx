"use client";

import { m, useReducedMotion } from "framer-motion";

type StaggerTextProps = {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
};

/**
 * Reveals a headline word-by-word on load with a subtle upward mask.
 * Used for hero statements — the orchestrated page-load moment.
 */
export function StaggerText({
  text,
  className,
  wordClassName,
  delay = 0,
}: StaggerTextProps) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  if (reduce) {
    return <span className={className}>{text}</span>;
  }

  return (
    <span className={className} aria-label={text}>
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden align-bottom"
          aria-hidden
        >
          <m.span
            className={`inline-block ${wordClassName ?? ""}`}
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.9,
              delay: delay + i * 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            {word}
            {i < words.length - 1 ? " " : ""}
          </m.span>
        </span>
      ))}
    </span>
  );
}
