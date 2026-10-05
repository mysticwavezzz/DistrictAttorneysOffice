import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";

export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="wrap">
      <a href="#main" className="skiplink">Skip to main content</a>
      <SiteHeader />
      <div className="body">
        <Sidebar />
        <main className="paper" id="main">
          <p className="eyebrow">Website Policies</p>
          <h1>{title}</h1>
          <p className="note-inline">Last updated: October 4, 2026</p>
          <p className="lede">{intro}</p>
          <div className="legal-content">{children}</div>
        </main>
      </div>
      <SiteFooter />
    </div>
  );
}
