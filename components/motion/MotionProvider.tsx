"use client";

import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Loads only the motion features this site actually uses.
 *
 * Importing `motion` pulls framer-motion's whole feature set into the first
 * load — including the layout-projection engine and the drag/pan gesture
 * code, which together are the larger half of the package and which nothing
 * here renders: a grep for `layout`, `layoutId`, `drag` across components/
 * and app/ returns only prose in comments.
 *
 * `domAnimation` is animations, exit, whileInView, hover, tap and focus plus
 * the DOM renderer — every feature in use — and the `m` component carries no
 * features of its own, so what is not listed here is never bundled. Paired
 * with `strict`, which makes a stray `motion.*` throw rather than quietly
 * pulling the full bundle back in and undoing this.
 *
 * Static rather than `features={() => import(...)}`: async features leave
 * elements parked at their `initial` state until the chunk lands, which on
 * the hero is a visible hitch on the copy and the CTAs. This keeps the
 * animations frame-accurate from the first paint and still drops everything
 * unused.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
