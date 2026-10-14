import type { MetadataRoute } from "next";
import { nav, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return nav.map(({ href }) => ({ url: `${siteUrl}${href === "/" ? "" : href}` }));
}
