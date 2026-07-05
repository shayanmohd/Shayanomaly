import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://shayanmohd.github.io/Shayanomaly";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/markets", "/scanner", "/terminal", "/bots", "/settings"].map((path) => ({
    url: `${SITE_URL}${path}/`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.7,
  }));
}
