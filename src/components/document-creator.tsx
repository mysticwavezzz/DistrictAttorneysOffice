"use client";

import { useEffect, useMemo, useState } from "react";
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from "@/config/document-templates";

type SectionDraft = { heading: string; paragraphs: string[] };
type Draft = {
  draftName: string;
  court: string;
  county: string;
  caseNumber: string;
  partyOne: string;
  partyTwo: string;
  filingAccount: string;
  filerDetails: string;
  sectionDrafts: Record<string, SectionDraft>;
};

const blankDraft = (template: DocumentTemplate): Draft => ({
  draftName: template.title,
  court: "7th Judicial Circuit of the State of Chesapeake",
  county: "Harrison",
  caseNumber: "",
  partyOne: "The People of Harrison County",
  partyTwo: "",
  filingAccount: "",
  filerDetails: "",
  sectionDrafts: Object.fromEntries(template.sections.map((item) => [item.id, { heading: item.label, paragraphs: [""] }])),
});

function pdfText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e\n\t]/g, "?");
}

export function DocumentCreator() {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState("");
  const [activeSection, setActiveSection] = useState("caption");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("completed-document.pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query ? DOCUMENT_TEMPLATES.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query)) : DOCUMENT_TEMPLATES;
  }, [filter]);
  const categories = Array.from(new Set(filteredTemplates.map((item) => item.category)));
  const wordCount = useMemo(() => {
    if (!draft) return 0;
    return Object.values(draft.sectionDrafts).flatMap((item) => item.paragraphs).join(" ").trim().split(/\s+/).filter(Boolean).length;
  }, [draft]);
  const missing = useMemo(() => {
    if (!draft || !template) return [];
    return template.sections.filter((item) => item.required !== false && !draft.sectionDrafts[item.id]?.paragraphs.some((paragraph) => paragraph.trim())).map((item) => item.label);
  }, [draft, template]);

  function chooseTemplate(value: DocumentTemplate) {
    setTemplate(value);
    setDraft(blankDraft(value));
    setActiveSection("caption");
    setPdfUrl("");
    setError("");
  }

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
    setPdfUrl("");
  }

  function updateSection(id: string, change: (current: SectionDraft) => SectionDraft) {
    setDraft((current) => current ? {
      ...current,
      sectionDrafts: { ...current.sectionDrafts, [id]: change(current.sectionDrafts[id] ?? { heading: "", paragraphs: [""] }) },
    } : current);
    setPdfUrl("");
  }

  function selectSection(id: string) {
    setActiveSection(id);
    setError("");
  }

  async function renderPdf() {
    if (!draft || !template) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(template.pdfPath, { cache: "no-store" });
      if (!response.ok) throw new Error("SOURCE_PDF_UNAVAILABLE");
      const sourceBytes = await response.arrayBuffer();
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const source = await PDFDocument.load(sourceBytes);
      const output = await PDFDocument.create();
      output.setTitle(pdfText(draft.draftName || template.title));
      output.setSubject(pdfText(`Completed draft using the supplied ${template.title} source template`));
      const sourcePages = await output.copyPages(source, source.getPageIndices());
      sourcePages.forEach((page) => output.addPage(page));

      const font = await output.embedFont(StandardFonts.TimesRoman);
      const bold = await output.embedFont(StandardFonts.TimesRomanBold);
      const pageSize: [number, number] = [612, 792];
      const margin = 68;
      const fontSize = 11;
      const lineHeight = 16;
      let page = output.addPage(pageSize);
      let y = page.getHeight() - margin;
      let supplementPage = 1;

      const footer = () => {
        page.drawLine({ start: { x: margin, y: 42 }, end: { x: page.getWidth() - margin, y: 42 }, thickness: 0.5, color: rgb(0.72, 0.72, 0.72) });
        page.drawText("COMPLETED DRAFT ATTACHMENT - REVIEW BEFORE USE", { x: margin, y: 26, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
        page.drawText(String(supplementPage), { x: page.getWidth() - margin - 20, y: 26, size: 8, font, color: rgb(0.35, 0.35, 0.35) });
      };
      const nextPage = () => {
        footer();
        page = output.addPage(pageSize);
        supplementPage += 1;
        y = page.getHeight() - margin;
      };
      const ensureSpace = (height: number) => { if (y - height < 62) nextPage(); };
      const drawParagraph = (raw: string) => {
        const maxWidth = page.getWidth() - margin * 2;
        for (const paragraph of pdfText(raw).replace(/\r/g, "").split("\n")) {
          const words = paragraph.split(/\s+/).filter(Boolean);
          let line = "";
          for (const word of words) {
            const next = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(next, fontSize) > maxWidth && line) {
              ensureSpace(lineHeight);
              page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.08, 0.08, 0.08) });
              y -= lineHeight;
              line = word;
            } else line = next;
          }
          if (line) {
            ensureSpace(lineHeight);
            page.drawText(line, { x: margin, y, size: fontSize, font, color: rgb(0.08, 0.08, 0.08) });
            y -= lineHeight;
          } else y -= lineHeight;
        }
        y -= 7;
      };

      page.drawText("COMPLETED DRAFT DETAILS", { x: margin, y, size: 14, font: bold, color: rgb(0.08, 0.08, 0.08) });
      y -= 26;
      const metadata = [
        ["Document", draft.draftName || template.title], ["Court", draft.court], ["County", draft.county],
        ["Case number", draft.caseNumber], ["First party", draft.partyOne], ["Second party", draft.partyTwo],
        ["Filing account", draft.filingAccount], ["Additional filer details", draft.filerDetails],
      ] as const;
      for (const [label, value] of metadata) {
        if (!value.trim()) continue;
        ensureSpace(lineHeight * 2);
        page.drawText(pdfText(label), { x: margin, y, size: 9, font: bold, color: rgb(0.28, 0.31, 0.35) });
        y -= 13;
        drawParagraph(value);
      }
      for (const item of template.sections) {
        const entered = draft.sectionDrafts[item.id] ?? { heading: item.label, paragraphs: [] };
        const paragraphs = entered.paragraphs.map((value) => value.trim()).filter(Boolean);
        if (!paragraphs.length) continue;
        ensureSpace(lineHeight * 2);
        page.drawText(pdfText(entered.heading || item.label).toUpperCase(), { x: margin, y, size: 11, font: bold, color: rgb(0.08, 0.08, 0.08) });
        y -= 20;
        for (let index = 0; index < paragraphs.length; index += 1) {
          page.drawText(`${index + 1}.`, { x: margin, y, size: fontSize, font, color: rgb(0.08, 0.08, 0.08) });
          drawParagraph(paragraphs[index] ?? "");
        }
      }
      footer();

      const bytes = await output.save();
      const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }));
      setPdfUrl(url);
      setPdfName(`${(draft.draftName || template.title).replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "completed-document"}.pdf`);
    } catch (reason) {
      console.error("Could not render the completed document", reason);
      setError(reason instanceof Error && reason.message === "SOURCE_PDF_UNAVAILABLE"
        ? "The official source PDF could not be loaded. Your entries are still here. Retry in a moment."
        : "The completed PDF could not be rendered. Your entries are still here. Retry without refreshing this page.");
    } finally {
      setBusy(false);
    }
  }

  if (!template || !draft) {
    return <div className="document-creator">
      <p className="eyebrow">District Attorney document library</p>
      <h1>Start a document</h1>
      <p className="lede">Choose a DA source template. Complete each section in the editor, then render a PDF with the original template and your completed details.</p>
      <div className="field document-template-search"><label htmlFor="template-search">Find a DA template</label><input id="template-search" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search title or category" /></div>
      {!filteredTemplates.length ? <div className="empty-state"><p>No templates match that search.</p></div> : categories.map((category) => <section className="document-template-group" key={category} aria-labelledby={`template-category-${category}`}>
        <h2 id={`template-category-${category}`}>{category}</h2>
        <div className="document-template-grid">{filteredTemplates.filter((item) => item.category === category).map((item) => <article className="document-template-card" key={item.id}>
          <button type="button" className="document-template-select" onClick={() => chooseTemplate(item)}><span>{item.title}</span><small>Open the fillable document builder</small></button>
          <div className="document-template-links"><a href={item.copyUrl} target="_blank" rel="noopener noreferrer">Open the source in Google Docs ↗</a></div>
        </article>)}</div>
      </section>)}
    </div>;
  }

  const selectedSection = template.sections.find((item) => item.id === activeSection);
  const selectedDraft = selectedSection ? draft.sectionDrafts[selectedSection.id] : null;
  const outline = [{ id: "caption", label: "Caption", done: Boolean(draft.caseNumber.trim() && draft.partyTwo.trim()) }, ...template.sections.map((item) => ({ id: item.id, label: item.label, done: Boolean(draft.sectionDrafts[item.id]?.paragraphs.some((paragraph) => paragraph.trim())) }))];
  const activeIndex = Math.max(0, outline.findIndex((item) => item.id === activeSection));

  return <div className="document-creator document-builder">
    <div className="document-builder-top">
      <button type="button" className="document-back-link" onClick={() => { setTemplate(null); setDraft(null); setPdfUrl(""); }}>‹ All templates</button>
      <div className="field document-draft-name"><label htmlFor="draft-name">Document name</label><input id="draft-name" value={draft.draftName} maxLength={120} onChange={(event) => updateDraft("draftName", event.target.value)} /></div>
      <span className="document-draft-status" role="status">{pdfUrl ? "PDF ready" : "Draft not rendered"}</span>
      <div className="document-builder-tags"><span>{template.title}</span><span>{template.category}</span><span>DRAFT</span></div>
    </div>
    <p className="document-builder-intro">Complete the sections first. Choose any section from the outline; nothing is rendered until you select <strong>Render completed PDF</strong>.</p>
    <div className="document-builder-grid">
      <aside className="document-builder-sidebar">
        <section className="document-panel document-outline"><h2>Outline</h2>
          {outline.map((item) => <button type="button" key={item.id} className={activeSection === item.id ? "document-outline-item is-active" : "document-outline-item"} onClick={() => selectSection(item.id)} aria-current={activeSection === item.id ? "step" : undefined}>
            <span>{item.label}</span><small>{item.done ? "Complete" : item.id === "caption" ? "Case details" : "Required - empty"}</small>
          </button>)}
          <div className="document-outline-legend"><span>Complete</span><span>Needs information</span></div>
        </section>
        <section className="document-panel document-guidance"><h2>Source template</h2><p>The supplied DA PDF is kept as the opening pages of the rendered file. Your completed fields are formatted as a continuation after it.</p><a href={template.copyUrl} target="_blank" rel="noopener noreferrer">Open original Google Doc ↗</a></section>
      </aside>

      <main className="document-editor">
        {activeSection === "caption" ? <section className="document-panel document-content-section" id="document-section-caption">
          <header className="document-panel-heading"><h2>Caption</h2><span>Case and filing details</span></header>
          <p className="document-instruction">Enter the case and party information to include in the completed PDF.</p>
          <div className="document-form-grid">
            <div className="field document-field-wide"><label htmlFor="document-court">Court name</label><input id="document-court" value={draft.court} maxLength={140} onChange={(event) => updateDraft("court", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-county">County</label><input id="document-county" value={draft.county} maxLength={80} onChange={(event) => updateDraft("county", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-case-number">Case number</label><input id="document-case-number" value={draft.caseNumber} maxLength={80} onChange={(event) => updateDraft("caseNumber", event.target.value)} placeholder="Enter the assigned case number" /></div>
            <div className="field"><label htmlFor="document-party-one">First party</label><textarea id="document-party-one" rows={3} maxLength={1000} value={draft.partyOne} onChange={(event) => updateDraft("partyOne", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-party-two">Second party</label><textarea id="document-party-two" rows={3} maxLength={1000} value={draft.partyTwo} onChange={(event) => updateDraft("partyTwo", event.target.value)} placeholder="Defendant or opposing party" /></div>
            <div className="field"><label htmlFor="document-filing-account">Filing account username</label><input id="document-filing-account" value={draft.filingAccount} maxLength={100} onChange={(event) => updateDraft("filingAccount", event.target.value)} /></div>
            <div className="field"><label htmlFor="document-filer-details">Additional filer identification</label><textarea id="document-filer-details" rows={3} maxLength={1000} value={draft.filerDetails} onChange={(event) => updateDraft("filerDetails", event.target.value)} placeholder="Optional" /></div>
          </div>
        </section> : selectedSection && selectedDraft ? <section className="document-panel document-content-section" id={`document-section-${selectedSection.id}`}>
          <header className="document-panel-heading"><h2>{selectedSection.label}</h2><span>{template.title}</span></header>
          <p className="document-instruction">{selectedSection.hint}</p>
          <div className="field document-printed-heading"><label htmlFor={`heading-${selectedSection.id}`}>Printed heading</label><input id={`heading-${selectedSection.id}`} value={selectedDraft.heading} maxLength={120} onChange={(event) => updateSection(selectedSection.id, (current) => ({ ...current, heading: event.target.value }))} /></div>
          <p className="document-instruction">This heading appears above the text in the completed PDF.</p>
          <div className="document-paragraph-list">
            {selectedDraft.paragraphs.map((paragraph, index) => <div className="document-paragraph-field" key={`${selectedSection.id}-${index}`}>
              <label htmlFor={`paragraph-${selectedSection.id}-${index}`}>Paragraph {index + 1}</label>
              <textarea id={`paragraph-${selectedSection.id}-${index}`} rows={6} maxLength={12000} value={paragraph} onChange={(event) => updateSection(selectedSection.id, (current) => ({ ...current, paragraphs: current.paragraphs.map((value, paragraphIndex) => paragraphIndex === index ? event.target.value : value) }))} placeholder="Enter the information for this section" />
              {selectedDraft.paragraphs.length > 1 && <button type="button" className="govbtn-outline document-remove-paragraph" onClick={() => updateSection(selectedSection.id, (current) => ({ ...current, paragraphs: current.paragraphs.filter((_, paragraphIndex) => paragraphIndex !== index) }))}>Remove paragraph</button>}
            </div>)}
          </div>
          <button type="button" className="govbtn-outline" onClick={() => updateSection(selectedSection.id, (current) => ({ ...current, paragraphs: [...current.paragraphs, ""] }))}>＋ Add a paragraph</button>
        </section> : null}
        <nav className="document-section-nav" aria-label="Document sections">
          <button type="button" className="govbtn-outline" disabled={activeIndex <= 0} onClick={() => selectSection(outline[Math.max(0, activeIndex - 1)]?.id ?? "caption")}>Back</button>
          <span>Section {activeIndex + 1} of {outline.length}</span>
          <button type="button" className="govbtn" disabled={activeIndex >= outline.length - 1} onClick={() => selectSection(outline[Math.min(outline.length - 1, activeIndex + 1)]?.id ?? "caption")}>Next section</button>
        </nav>
      </main>

      <aside className="document-builder-aside">
        <section className="document-panel document-compliance"><header className="document-panel-heading"><h2>Draft check</h2><span className={missing.length ? "document-count document-count-warning" : "document-count"}>{missing.length ? `${missing.length} to complete` : "Ready"}</span></header>
          <p><strong>{wordCount}</strong> entered words</p><p className="document-instruction">This only checks for missing section text. Review the complete document before use.</p>
          {missing.length ? <ul className="document-missing-list">{missing.map((name) => <li key={name}>{name} needs information</li>)}</ul> : <p className="message message-success">All required sections have text.</p>}
        </section>
        <section className="document-panel document-preview"><header className="document-panel-heading"><h2>Completed PDF</h2><span>{pdfUrl ? "Ready" : "Not rendered"}</span></header>
          <p className="document-instruction">Render after entering the information. The original DA PDF remains first, followed by your completed sections.</p>
          <div className="document-preview-actions"><button className="govbtn" type="button" onClick={() => void renderPdf()} disabled={busy}>{busy ? "Rendering PDF…" : pdfUrl ? "Render PDF again" : "Render completed PDF"}</button>{pdfUrl && <a className="govbtn-outline" href={pdfUrl} download={pdfName}>Download PDF</a>}</div>
          {error && <p className="message message-error" role="alert">{error}</p>}
          {pdfUrl ? <iframe className="document-pdf-frame" title="Completed DA template and entered information" src={pdfUrl} /> : <div className="document-preview-empty">Your PDF preview appears here after you finish entering the information and render it.</div>}
        </section>
        <p className="document-disclaimer">Draft is held in this page only. Refreshing or leaving clears the entered information.</p>
      </aside>
    </div>
  </div>;
}
