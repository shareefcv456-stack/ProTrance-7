"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * next/image that fades in once decoded instead of snapping in.
 *
 * Mobile Safari starts lazy images only near the viewport and decodes them
 * async, so a cutout could land after its card had already faded in — an
 * empty panel, then the image popping in. Eager loading removes most of that;
 * the fade covers the rest on slow networks. Scoped below sm so desktop
 * renders exactly as before. next/image fires onLoad for images that finished
 * before hydration too, so a cached image never stays hidden.
 */
export function FadeInImage({ className, onLoad, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      // sm: overrides rather than max-sm:, which the raw `short`/`squat`
      // screens in tailwind.config disable.
      className={`${className ?? ""} transition-opacity duration-700 ease-out sm:transition-none motion-reduce:transition-none ${
        loaded ? "" : "opacity-0 sm:opacity-100"
      }`}
    />
  );
}
