import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // AVIF first: the hero poster is a large photograph and it lands roughly
    // 30% under the WebP Next already serves. Next falls back per Accept
    // header, so nothing breaks on a browser that cannot take it.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
    ],
  },
};

/* `next dev` and `next build` write to different directories.

   They shared `.next` by default, and that is a live foot-gun rather than a
   theoretical one: a production build empties `static/` and writes hashed
   chunks, while a dev server already running still serves HTML pointing at
   the unhashed dev names it compiled earlier — `chunks/app/page.js`,
   `css/app/layout.css`. Every one of them 404s, nothing hydrates, and the
   page hangs on the server-rendered markup with no error to explain it.

   Splitting on phase is the framework's own hook for this, needs no env var
   and no cross-platform shell prefix, so `npm run dev` and `npm run build`
   simply cannot clobber each other any more. `next start` runs in the
   production phase and reads `.next`, which is what `next build` writes. */
export default (phase) => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
});
