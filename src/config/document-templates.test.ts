import { describe, expect, it } from "vitest";
import { DOCUMENT_TEMPLATES, getDocumentTemplate } from "@/config/document-templates";

describe("document creator templates", () => {
  it("includes each of the 19 supplied official copy links and the civil complaint builder", () => {
    const officialTemplates = DOCUMENT_TEMPLATES.filter((template) => template.copyUrl);
    expect(officialTemplates).toHaveLength(19);
    expect(DOCUMENT_TEMPLATES).toHaveLength(20);
    expect(DOCUMENT_TEMPLATES.find((template) => template.id === "civil-complaint")?.sections.map((section) => section.label))
      .toEqual(["Claims for Relief", "Demand for Relief"]);
  });

  it("keeps template identifiers unique and direct-copy links paired with editable source links", () => {
    expect(new Set(DOCUMENT_TEMPLATES.map((template) => template.id)).size).toBe(DOCUMENT_TEMPLATES.length);
    for (const template of DOCUMENT_TEMPLATES.filter((item) => item.copyUrl)) {
      expect(template.copyUrl).toMatch(/^https:\/\/docs\.google\.com\/document\/d\/[^/]+\/copy$/);
      expect(template.editUrl).toMatch(/^https:\/\/docs\.google\.com\/document\/d\//);
      expect(new URL(template.copyUrl!).pathname.split("/")[3]).toBe(new URL(template.editUrl!).pathname.split("/")[3]);
    }
    expect(getDocumentTemplate("missing-template")).toBeUndefined();
  });
});
