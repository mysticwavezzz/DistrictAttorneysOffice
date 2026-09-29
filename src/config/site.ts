export const siteConfig = {
  name: "District Attorney's Office",
  shortName: "District Attorney's Office",
  county: "Harrison County",
  tagline: "Pursuing Justice. Protecting the Community.",
  description:
    "The official public website of the Harrison County District Attorney's Office — public releases, office information, and a confidential criminal tips line.",
  contact: {
    email: "info@harrisoncountyda.example",
    address: "County Hall, Jamestown",
  },
  hours: [{ day: "Every day, 365 days a year", time: "Open 24 hours" }],
  nav: [
    { label: "Home", href: "/" },
    { label: "Announcements", href: "/#announcements" },
    { label: "Submit a Tip", href: "/#tips" },
    { label: "Office Info", href: "/office-info" },
  ],
} as const;
