import { siteConfig } from "@/config/site";
import { officeDiscordContacts } from "@/config/contacts";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";

export default function ContactsPage() {
  return <div className="wrap">
    <a href="#main" className="skiplink">Skip to main content</a><SiteHeader />
    <div className="body"><Sidebar /><main className="paper" id="main">
      <p className="eyebrow">{siteConfig.county}</p><h1>Contact Us</h1>
      <p className="lede">For leadership and Criminal Division questions, contact the appropriate Discord user:</p>
      <div className="release-list">{officeDiscordContacts.map((contact) => <article className="release-card" key={contact.handle}><div className="release-card-body"><strong className="release-card-title">{contact.role}</strong><span className="release-card-excerpt">{contact.handle}</span></div></article>)}</div>
    </main></div><SiteFooter />
  </div>;
}
