export const siteConfig = {
  name: "District Attorney's Office",
  shortName: "District Attorney's Office",
  county: "Harrison County",
  tagline: "Pursuing Justice. Protecting the Community.",
  description:
    "The public website of the Harrison County District Attorney's Office with announcements, Discord contacts, and a criminal tip line.",
  nav: [
    { label: "Home", href: "/" },
    { label: "Announcements", href: "/#announcements" },
    { label: "Submit a Tip", href: "/report-crime" },
    { label: "Contact Us", href: "/contacts" },
  ],
} as const;
