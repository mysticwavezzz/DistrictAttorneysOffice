import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { siteConfig } from "@/config/site";
import { MaintenanceWatcher } from "@/components/maintenance-watcher";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://districtattorneysoffice-production.up.railway.app"),
  title: {
    default: `${siteConfig.county} ${siteConfig.name}`,
    template: `%s | ${siteConfig.county} ${siteConfig.name}`,
  },
  description: siteConfig.description,
  openGraph: {
    type: "website",
    siteName: `${siteConfig.county} ${siteConfig.name}`,
    title: `${siteConfig.county} ${siteConfig.name}`,
    description: siteConfig.description,
    url: "/",
    images: [{ url: "/seal.webp", width: 512, height: 512, alt: `${siteConfig.county} seal` }],
  },
  twitter: { card: "summary", title: `${siteConfig.county} ${siteConfig.name}`, description: siteConfig.description, images: ["/seal.webp"] },
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
    var maintenancePage = window.location.pathname === "/maintenance";
    var stored = maintenancePage ? "auto" : (localStorage.getItem("da-theme") || "auto");
    var effective = stored;
    if (stored === "auto") {
      var preference = window.matchMedia("(prefers-color-scheme: dark)");
      effective = preference.matches ? "dark" : "light";
      if (maintenancePage) {
        preference.addEventListener("change", function (event) {
          document.documentElement.setAttribute("data-theme", event.matches ? "dark" : "light");
        });
      }
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
      <body>{children}<SessionProvider><MaintenanceWatcher /></SessionProvider></body>
    </html>
  );
}
