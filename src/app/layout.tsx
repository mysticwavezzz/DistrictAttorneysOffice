import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
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

const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("da-theme") || "auto";
    var effective = stored;
    if (stored === "auto") {
      effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.documentElement.setAttribute("data-theme", effective);
  } catch (e) {}
})();
`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
