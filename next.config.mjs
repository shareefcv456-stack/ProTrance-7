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

export default nextConfig;
