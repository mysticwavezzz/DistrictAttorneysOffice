import type { Metadata, Viewport } from "next";
import "./globals.css";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.county} ${siteConfig.name}`,
    template: `%s | ${siteConfig.county} ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: "/seal.webp",
    shortcut: "/seal.webp",
    apple: "/seal.webp",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
