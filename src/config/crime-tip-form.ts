export const CRIME_TIP_FORM = {
  viewUrl: "https://docs.google.com/forms/d/e/1FAIpQLScdCmeEdCDSqbONCz7XWO4MPCxKL0iipYaz7-TJ3nlDLcgTUA/viewform",
  actionUrl: "https://docs.google.com/forms/d/e/1FAIpQLScdCmeEdCDSqbONCz7XWO4MPCxKL0iipYaz7-TJ3nlDLcgTUA/formResponse",
  entries: {
    submitterRoblox: "entry.518041158",
    submitterDiscord: "entry.1928000296",
    legalAcknowledgment: "entry.446968180",
    crimeType: "entry.976662375",
    incidentDateTime: "entry.1507954747",
    location: "entry.671224430",
    suspectRoblox: "entry.1983927215",
    suspectDiscord: "entry.123044666",
    suspectInformation: "entry.391222520",
    narrative: "entry.647899762",
    evidence: "entry.878935833",
    witnesses: "entry.829987284",
    identityWaiver: "entry.1287023313",
    truthAffirmation: "entry.663670808",
    signature: "entry.1025312400",
  },
  crimeTypes: [
    "Violent Crime (Assault, Murder, etc.)",
    "Organized Crime / Gang Activity",
    "Trafficking / Manufacturing",
    "Government / Police Corruption",
    "Robbery / Theft",
    "Wanted Persons Sighting",
    "Other:",
  ],
} as const;

export type CrimeTipFormConfiguration = {
  viewUrl: string;
  actionUrl: string;
  entries: Record<keyof typeof CRIME_TIP_FORM.entries, string>;
  crimeTypes: readonly string[];
};
