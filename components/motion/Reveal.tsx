"use client";

import { m } from "framer-motion";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import type { ReactNode } from "react";

type RevealProps = {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "span" | "li" | "section" | "header";
  once?: boolean;
};

/**
 * Scroll-triggered reveal. Content rises and fades in as it enters the
 * viewport. Honors prefers-reduced-motion by rendering statically.
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
  as = "div",
  once = true,
}: RevealProps) {
  const reduce = useReducedMotion();
  const MotionTag = m[as];
  // viewport is observer config, not markup, so reading it during render
  // cannot cause a hydration mismatch.
  const mobile =
    typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  if (reduce) {
    const Tag = as;
    return <Tag className={className}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      // -12% of a phone viewport holds content invisible across its bottom
      // ~100px, which reads as blank space mid-scroll; trigger sooner below sm.
      viewport={{ once, margin: mobile ? "0px 0px -4% 0px" : "-12% 0px -12% 0px" }}
      transition={{
        duration: 0.75,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </MotionTag>
  );
}
