import type { Metadata } from "next";
import Link from "next/link";
import { siteConfig } from "@/config/site";
import { Seal } from "@/components/seal";
import { SiteFooter } from "@/components/site-footer";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="wrap not-found-wrap">
      <header className="not-found-masthead">
        <Link className="not-found-brand" href="/" aria-label={`${siteConfig.name} home`}>
          <Seal className="not-found-seal" />
          <span>
            <span className="not-found-county">{siteConfig.county}</span>
            <strong>{siteConfig.name}</strong>
          </span>
        </Link>
        <span className="not-found-header-note">Official website</span>
      </header>

      <main id="main" className="not-found-main">
        <section className="not-found-card" aria-labelledby="not-found-title">
          <div className="not-found-code" aria-hidden="true">404</div>
          <div className="not-found-copy">
            <p className="eyebrow">Page not found</p>
            <h1 id="not-found-title">We can’t find that page.</h1>
            <p className="lede">The address may be outdated or mistyped. You can return to the homepage or choose one of the common destinations below.</p>
            <div className="not-found-actions">
              <Link href="/" className="govbtn">Return home</Link>
              <Link href="/report-crime" className="govbtn-outline">Submit a tip</Link>
            </div>
            <nav className="not-found-links" aria-label="Helpful links">
              <Link href="/contacts">Contact Us</Link>
              <Link href="/records-request">Public records request</Link>
              <Link href="/login">Staff sign in</Link>
            </nav>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
