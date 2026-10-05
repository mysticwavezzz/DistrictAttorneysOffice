"use client";

import { useEffect, useMemo, useState } from "react";
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from "@/config/document-templates";

type Draft = {
  draftName: string;
  documentTitle: string;
  court: string;
  county: string;
  caseNumber: string;
  partyOne: string;
  partyTwo: string;
  filingAccount: string;
  filerDetails: string;
  sectionText: Record<string, string>;
};

const blankDraft = (template: DocumentTemplate): Draft => ({
  draftName: template.title,
  documentTitle: template.title,
  court: "",
  county: "Harrison",
  caseNumber: "",
  partyOne: "",
  partyTwo: "",
  filingAccount: "",
  filerDetails: "",
  sectionText: Object.fromEntries(template.sections.map((section) => [section.id, ""])),
});

function cleanPdfText(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7e\n\t]/g, "?");
}

export function DocumentCreator() {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("draft.pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("caption");

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    if (!query) return DOCUMENT_TEMPLATES;
    return DOCUMENT_TEMPLATES.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query));
  }, [filter]);

  const wordCount = useMemo(() => {
    if (!draft) return 0;
    return Object.values(draft.sectionText).join(" ").trim().split(/\s+/).filter(Boolean).length;
  }, [draft]);

  const missing = useMemo(() => {
    if (!draft || !template) return [];
    return [
      ...(!draft.court.trim() ? ["Court name"] : []),
      ...(!draft.county.trim() ? ["County"] : []),
      ...(!draft.documentTitle.trim() ? ["Document title"] : []),
      ...(!draft.partyOne.trim() ? ["First party"] : []),
      ...(!draft.partyTwo.trim() ? ["Second party"] : []),
      ...template.sections.filter((section) => !draft.sectionText[section.id]?.trim()).map((section) => section.label),
    ];
  }, [draft, template]);

  function chooseTemplate(selected: DocumentTemplate) {
    setTemplate(selected);
    setDraft(blankDraft(selected));
    setPdfUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return ""; });
    setError("");
    setActiveSection("caption");
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
  }

  function scrollToSection(id: string) {
    setActiveSection(id);
    document.getElementById(`document-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function renderPdf() {
    if (!draft || !template) return;
    setBusy(true);
    setError("");
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const pdf = await PDFDocument.create();
      pdf.setTitle(cleanPdfText(draft.documentTitle || template.title));
      pdf.setSubject(cleanPdfText(`${template.title} · Draft for review`));
      const font = await pdf.embedFont(StandardFonts.TimesRoman);
      const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
      const pageSize: [number, number] = [612, 792];
      const margin = 68;
      const fontSize = 11;
      const lineHeight = 17;
      let page = pdf.addPage(pageSize);
      let y = page.getHeight() - margin;
      let pageNumber = 1;

      const drawFooter = () => {
        page.drawLine({ start: { x: margin, y: 39 }, end: { x: page.getWidth() - margin, y: 39 }, thickness: 0.5, color: rgb(0.72, 0.72, 0.72) });
        page.drawText("DRAFT FOR REVIEW - NOT FILED OR SERVED", { x: margin, y: 24, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
        page.drawText(String(pageNumber), { x: page.getWidth() - margin - 20, y: 24, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
      };

      const nextPage = () => {
        drawFooter();
        page = pdf.addPage(pageSize);
        pageNumber += 1;
        y = page.getHeight() - margin;
      };

      const ensureSpace = (height: number) => { if (y - height < 58) nextPage(); };

      const drawWrapped = (raw: string, options: { size?: number; font?: typeof font; indent?: number; gap?: number } = {}) => {
        const drawFont = options.font ?? font;
        const size = options.size ?? fontSize;
        const indent = options.indent ?? 0;
        const gap = options.gap ?? 0;
        const maxWidth = page.getWidth() - margin * 2 - indent;
        const paragraphs = cleanPdfText(raw).replace(/\r/g, "").split("\n");
        for (const paragraph of paragraphs) {
          const words = paragraph.split(/\s+/).filter(Boolean);
          let line = "";
          for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (drawFont.widthOfTextAtSize(candidate, size) > maxWidth && line) {
              ensureSpace(lineHeight);
              page.drawText(line, { x: margin + indent, y, size, font: drawFont, color: rgb(0.08, 0.08, 0.08) });
              y -= lineHeight;
              line = word;
            } else line = candidate;
          }
          if (line) {
            ensureSpace(lineHeight);
            page.drawText(line, { x: margin + indent, y, size, font: drawFont, color: rgb(0.08, 0.08, 0.08) });
            y -= lineHeight;
          } else y -= lineHeight;
        }
        y -= gap;
      };

      const drawLabel = (label: string, value: string) => {
        if (!value.trim()) return;
        ensureSpace(lineHeight * 2);
        page.drawText(cleanPdfText(label), { x: margin, y, size: 9, font: bold, color: rgb(0.28, 0.31, 0.35) });
        y -= 13;
        drawWrapped(value, { indent: 8, gap: 5 });
      };

      page.drawText(cleanPdfText(draft.court || "COURT NAME"), { x: margin, y, size: 12, font: bold, color: rgb(0.06, 0.06, 0.06) });
      y -= 18;
      const countyLabel = draft.county.trim() ? (/\bcounty$/i.test(draft.county.trim()) ? draft.county.trim() : `${draft.county.trim()} County`) : "County";
      page.drawText(cleanPdfText(countyLabel), { x: margin, y, size: 11, font, color: rgb(0.08, 0.08, 0.08) });
      y -= 30;
      page.drawRectangle({ x: margin, y: y - 55, width: page.getWidth() - margin * 2, height: 61, borderColor: rgb(0.55, 0.58, 0.62), borderWidth: 0.8 });
      const splitX = page.getWidth() / 2;
      page.drawLine({ start: { x: splitX, y: y - 55 }, end: { x: splitX, y: y + 6 }, thickness: 0.8, color: rgb(0.55, 0.58, 0.62) });
      page.drawText(cleanPdfText(draft.partyOne || "First party"), { x: margin + 10, y: y - 17, size: 10, font, maxWidth: splitX - margin - 22 });
      page.drawText("v.", { x: margin + 10, y: y - 32, size: 10, font });
      page.drawText(cleanPdfText(draft.partyTwo || "Second party"), { x: margin + 10, y: y - 47, size: 10, font, maxWidth: splitX - margin - 22 });
      page.drawText(cleanPdfText(`Case No. ${draft.caseNumber || "________"}`), { x: splitX + 10, y: y - 23, size: 10, font, maxWidth: page.getWidth() - margin - splitX - 20 });
      page.drawText(cleanPdfText(draft.documentTitle || template.title), { x: splitX + 10, y: y - 42, size: 10, font: bold, maxWidth: page.getWidth() - margin - splitX - 20 });
      y -= 88;

      for (const section of template.sections) {
        const text = draft.sectionText[section.id]?.trim();
        if (!text) continue;
        ensureSpace(lineHeight * 2);
        page.drawText(cleanPdfText(section.label.toUpperCase()), { x: margin, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
        y -= 20;
        drawWrapped(text, { indent: 12, gap: 12 });
      }

      drawLabel("FILING ACCOUNT", draft.filingAccount);
      drawLabel("ADDITIONAL FILER IDENTIFICATION", draft.filerDetails);
      drawLabel("PREPARED", new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date()));
      drawFooter();

      const bytes = await pdf.save();
      const file = new Blob([Uint8Array.from(bytes)], { type: "application/pdf" });
      setPdfUrl((previous) => { if (previous) URL.revokeObjectURL(previous); return URL.createObjectURL(file); });
      setPdfName(`${(draft.draftName || template.title).replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "document"}.pdf`);
    } catch (reason) {
      console.error("Could not render document draft", reason);
      setError("The PDF preview could not be created. Check the draft fields and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!template || !draft) {
    const categories = Array.from(new Set(filteredTemplates.map((item) => item.category)));
    return <div className="document-creator">
      <p className="eyebrow">Staff tools</p>
      <h1>Document Creator</h1>
      <p className="lede">Choose a document to start a private draft. Official source documents are linked where provided.</p>
      <div className="field document-template-search"><label htmlFor="template-search">Find a document</label><input id="template-search" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search title or category" /></div>
      {!filteredTemplates.length ? <div className="empty-state"><p>No document types match that search.</p></div> : categories.map((category) => <section className="document-template-group" key={category} aria-labelledby={`template-category-${category}`}>
        <h2 id={`template-category-${category}`}>{category}</h2>
        <div className="document-template-grid">{filteredTemplates.filter((item) => item.category === category).map((item) => <article className="document-template-card" key={item.id}>
          <button type="button" className="document-template-select" onClick={() => chooseTemplate(item)}>
            <span>{item.title}</span><small>{item.copyUrl ? "Build a local draft · official template available" : "Build a local draft · no source link supplied"}</small>
          </button>
          <div className="document-template-links">{item.editUrl && <a href={item.editUrl} target="_blank" rel="noopener noreferrer">Open official doc ↗</a>}{item.copyUrl && <a href={item.copyUrl} target="_blank" rel="noopener noreferrer">Make a copy ↗</a>}</div>
        </article>)}</div>
      </section>)}
      <p className="document-disclaimer">Drafting aid only. The builder does not verify legal sufficiency, file with a court, or serve a document. For the supplied forms, review the linked official source before use.</p>
    </div>;
  }

  const allOutline = [{ id: "caption", label: "Caption" }, ...template.sections.map((section) => ({ id: section.id, label: section.label }))];
  return <div className="document-creator document-builder">
    <div className="document-builder-top">
      <a href="/dashboard/templates">‹ All document types</a>
      <div className="field document-draft-name"><label htmlFor="draft-name">Draft name</label><input id="draft-name" value={draft.draftName} maxLength={100} onChange={(event) => updateDraft("draftName", event.target.value)} /></div>
      <span className="document-draft-status">{pdfUrl ? "Preview ready" : "Private draft"}</span>
      <div className="document-builder-tags"><span>{template.title}</span><span>{template.category}</span><span>DRAFT</span></div>
    </div>
    <div className="document-builder-grid">
      <aside className="document-builder-sidebar">
        <section className="document-panel document-outline">
          <h2>Outline</h2>
          {allOutline.map((item) => <button type="button" key={item.id} className={activeSection === item.id ? "document-outline-item is-active" : "document-outline-item"} onClick={() => scrollToSection(item.id)}><span>{item.label}</span><small>{item.id === "caption" ? "Case details" : draft.sectionText[item.id]?.trim() ? "Draft text added" : "Blank"}</small></button>)}
        </section>
        <section className="document-panel document-guidance"><h2>Before you use it</h2><p>This editor creates a local draft only. It does not save to the case record, file a pleading, or serve anyone.</p>{template.copyUrl && <a href={template.copyUrl} target="_blank" rel="noopener noreferrer">Open the supplied official copy ↗</a>}<p>Confirm the correct court, local rules, source form, and filing requirements independently.</p></section>
      </aside>
      <main className="document-editor">
        <section className="document-panel" id="document-section-caption">
          <header className="document-panel-heading"><h2>Caption</h2><span>Document details</span></header>
          <p className="document-instruction">Enter the case caption and the text you want included. These fields are not uploaded or stored by the site.</p>
          <div className="document-form-grid">
            <div className="field document-field-wide"><label htmlFor="document-court">Court name</label><input id="document-court" value={draft.court} maxLength={120} onChange={(event) => updateDraft("court", event.target.value)} placeholder="Enter the court name" /></div>
            <div className="field"><label htmlFor="document-county">County</label><input id="document-county" value={draft.county} maxLength={80} onChange={(event) => updateDraft("county", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-case-number">Case number</label><input id="document-case-number" value={draft.caseNumber} maxLength={80} onChange={(event) => updateDraft("caseNumber", event.target.value)} placeholder="Leave blank if not assigned" /></div>
            <div className="field document-field-wide"><label htmlFor="document-title">Title of document</label><input id="document-title" value={draft.documentTitle} maxLength={160} onChange={(event) => updateDraft("documentTitle", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-party-one">{template.id === "civil-complaint" ? "Plaintiff" : "First party or group"}</label><textarea id="document-party-one" rows={3} maxLength={1000} value={draft.partyOne} onChange={(event) => updateDraft("partyOne", event.target.value)} placeholder="One name per line" /></div>
            <div className="field"><label htmlFor="document-party-two">{template.id === "civil-complaint" ? "Defendant" : "Second party or group"}</label><textarea id="document-party-two" rows={3} maxLength={1000} value={draft.partyTwo} onChange={(event) => updateDraft("partyTwo", event.target.value)} placeholder="One name per line" /></div>
            <div className="field"><label htmlFor="document-filing-account">Filing account username</label><input id="document-filing-account" value={draft.filingAccount} maxLength={100} onChange={(event) => updateDraft("filingAccount", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-filer-details">Additional filer identification</label><textarea id="document-filer-details" rows={3} maxLength={1000} value={draft.filerDetails} onChange={(event) => updateDraft("filerDetails", event.target.value)} placeholder="Optional identification or contact details" /></div>
          </div>
        </section>
        {template.sections.map((section) => <section className="document-panel document-content-section" id={`document-section-${section.id}`} key={section.id}>
          <header className="document-panel-heading"><h2>{section.label}</h2><span>Draft section</span></header>
          <p className="document-instruction">{section.hint}</p>
          <div className="field"><label htmlFor={`document-text-${section.id}`}>{section.label} text</label><textarea id={`document-text-${section.id}`} rows={8} maxLength={12000} value={draft.sectionText[section.id] ?? ""} onFocus={() => setActiveSection(section.id)} onChange={(event) => updateDraft("sectionText", { ...draft.sectionText, [section.id]: event.target.value })} placeholder="Enter or paste draft text" /></div>
        </section>)}
      </main>
      <aside className="document-builder-aside">
        <section className="document-panel document-compliance"><header className="document-panel-heading"><h2>Draft check</h2><span className={missing.length ? "document-count document-count-warning" : "document-count"}>{missing.length ? `${missing.length} to review` : "Ready"}</span></header>
          <p><strong>{wordCount}</strong> body words</p><p className="document-instruction">This checklist only checks for blank fields. It does not determine legal compliance.</p>
          {missing.length ? <ul className="document-missing-list">{missing.map((name) => <li key={name}>{name} is blank</li>)}</ul> : <p className="message message-success">All draft sections contain text.</p>}
        </section>
        <section className="document-panel document-preview"><header className="document-panel-heading"><h2>PDF preview</h2><span>Local</span></header>
          <p className="document-instruction">Preview the draft as a PDF. Nothing is filed or sent.</p>
          <div className="document-preview-actions"><button className="govbtn" type="button" onClick={() => void renderPdf()} disabled={busy}>{busy ? "Rendering…" : "Render PDF"}</button>{pdfUrl && <a className="govbtn-outline" href={pdfUrl} download={pdfName}>Download PDF</a>}</div>
          {error && <p className="message message-error" role="alert">{error}</p>}
          {pdfUrl ? <iframe className="document-pdf-frame" title="Generated draft PDF preview" src={pdfUrl} /> : <div className="document-preview-empty">Render a preview to see the draft here.</div>}
        </section>
        <p className="document-disclaimer">Private to this browser tab. Closing or refreshing the page clears this draft.</p>
      </aside>
    </div>
  </div>;
}
