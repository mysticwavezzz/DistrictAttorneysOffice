import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

const siteName = `${siteConfig.county} ${siteConfig.name}`;

export function shareMetadata(title: string, description: string, path: string): Metadata {
  const image = `/api/og/page?title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description,
      url: path,
      siteName,
      images: [{ url: image, width: 1200, height: 630, alt: `${title} - ${siteName}` }],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}
