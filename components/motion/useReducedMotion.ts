"use client";

import { useEffect, useState } from "react";
import { useReducedMotion as useFramerReducedMotion } from "framer-motion";

/** Hydration-safe reduced-motion preference.
 *
 * framer-motion's hook reads the media query during the first client
 * render, while the server has no preference to read and renders as if
 * motion were allowed. With "reduce motion" on, the two disagreed — the hero
 * omitted its stage marker, StaggerText rendered plain text — and React threw
 * hydration errors #418/#423 and re-rendered the whole root on the client.
 * Reporting `false` until mounted keeps the first client render identical to
 * the server's; the real preference applies one commit later. */
export function useReducedMotion(): boolean {
  const preference = useFramerReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted && preference === true;
}
