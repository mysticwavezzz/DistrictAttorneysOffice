"use client";

import { useMemo, useState, useTransition } from "react";
import { DOCUMENT_TEMPLATES, type DocumentField, type DocumentFieldGroup, type DocumentTemplate, type PdfTextRegion } from "@/config/document-templates";
import { addFiling } from "@/app/dashboard/cases/actions";

type DocumentCase = { id: string; caseNumber: string; title: string; type: string | null; partyDetails: string };
type Draft = { documentName: string; values: Record<string, string>; repeated: Record<string, Record<string, string>[]> };
type Props = { cases: DocumentCase[]; initialCaseId?: string; filingUsername: string };

const COMMON_FIELDS: DocumentField[] = [
  { id: "caseNumber", label: "Case / action number", type: "text", required: true, placeholder: "Select a case or enter the assigned number" },
  { id: "plaintiff", label: "Plaintiff", type: "text", required: true, placeholder: "The People of Harrison County" },
  { id: "defendant", label: "Defendant", type: "text", required: true, placeholder: "Defendant's name" },
];
const SIGNATURE_FIELDS: DocumentField[] = [
  { id: "filingDate", label: "Filing date", type: "date", required: true },
  { id: "attorneyName", label: "Filing attorney name", type: "text", required: true, help: "Printed in the attorney signature block." },
  { id: "barId", label: "Bar or staff ID", type: "text", required: false, help: "Optional." },
];

const REGION_ALIASES: Record<string, Record<string, string>> = {
  "criminal-information": { defendant: "defendantDetails" },
  "probable-cause": { details: "affiant", facts: "narrative" },
  "witness-statements-notice": { statements: "reports" },
  "evidence-disclosure": { items: "evidence" },
  "criminal-arrests-record": { arrests: "arrests" },
  "search-warrant": { target: "target", basis: "basis", execution: "execution", signature: "applicantSignature" },
  "subpoena": { materials: "materials" },
  "lawyer-development-affidavit": { student: "participants", supervisor: "participants", signature: "signatures" },
  "plea-guilty": { plea: "charges" },
  "sentencing-order": { disposition: "sentence", signatures: "signatures" },
  "appeal-rights": { judgment: "attorney", acknowledgment: "acknowledgment" },
};

function commonFieldsFor(template: DocumentTemplate) {
  return template.id === "search-warrant" ? COMMON_FIELDS.slice(0, 1) : COMMON_FIELDS;
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function fieldDefaults(template: DocumentTemplate, filingUsername: string): Draft {
  const values: Record<string, string> = {
    plaintiff: "The People of Harrison County",
    filingDate: todayInput(),
    attorneyName: filingUsername,
  };
  const repeated: Draft["repeated"] = {};
  for (const section of template.sections) {
    for (const field of section.fields) values[field.id] ??= "";
    if (section.repeatable) repeated[section.id] = [Object.fromEntries(section.fields.map((field) => [field.id, ""]))];
  }
  return { documentName: template.title, values, repeated };
}

function cleanPdfText(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/[^\x20-\x7e]/g, "?");
}

function wrapText(value: string, width: number, font: { widthOfTextAtSize: (value: string, size: number) => number }, fontSize: number) {
  const words = cleanPdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(candidate, fontSize) > width) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

function blankRegion(page: { getHeight: () => number; drawRectangle: (options: Record<string, unknown>) => void }, region: PdfTextRegion, white: unknown) {
  page.drawRectangle({ x: region.x, y: page.getHeight() - region.top - region.height, width: region.width, height: region.height, color: white });
}

export function DocumentCreator({ cases, initialCaseId = "", filingUsername }: Props) {
  const [template, setTemplate] = useState<DocumentTemplate | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState(initialCaseId);
  const [attachCaseId, setAttachCaseId] = useState(initialCaseId);
  const [filter, setFilter] = useState("");
  const [activeSection, setActiveSection] = useState("caption");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfName, setPdfName] = useState("completed-document.pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [isAdding, startAddTransition] = useTransition();

  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query ? DOCUMENT_TEMPLATES.filter((item) => `${item.title} ${item.category}`.toLocaleLowerCase().includes(query)) : DOCUMENT_TEMPLATES;
  }, [filter]);
  const categories = Array.from(new Set(filteredTemplates.map((item) => item.category)));

  function invalidatePdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl("");
  }

  function chooseTemplate(value: DocumentTemplate) {
    invalidatePdf();
    setTemplate(value);
    setDraft(fieldDefaults(value, filingUsername));
    setActiveSection("caption");
    setError("");
    const selected = cases.find((item) => item.id === selectedCaseId);
    if (selected) applyCaseDetails(value, selected);
  }

  function applyCaseDetails(targetTemplate: DocumentTemplate, record: DocumentCase) {
    let parties: { name?: string; role?: string }[] = [];
    try { parties = JSON.parse(record.partyDetails) as { name?: string; role?: string }[]; } catch { parties = []; }
    const defendant = parties.find((party) => /defendant/i.test(party.role ?? ""))?.name ?? "";
    const plaintiff = parties.find((party) => /plaintiff/i.test(party.role ?? ""))?.name ?? "The People of Harrison County";
    setDraft((current) => {
      if (!current) return current;
      return { ...current, values: { ...current.values, caseNumber: record.caseNumber, defendant, plaintiff } };
    });
    invalidatePdf();
  }

  function selectCase(caseId: string) {
    setSelectedCaseId(caseId);
    setAttachCaseId(caseId);
    const record = cases.find((item) => item.id === caseId);
    if (record && template) applyCaseDetails(template, record);
  }

  function updateValue(id: string, value: string) {
    setDraft((current) => current ? { ...current, values: { ...current.values, [id]: value } } : current);
    invalidatePdf();
  }

  function updateRepeated(groupId: string, rowIndex: number, fieldId: string, value: string) {
    setDraft((current) => {
      if (!current) return current;
      const rows = [...(current.repeated[groupId] ?? [])];
      rows[rowIndex] = { ...(rows[rowIndex] ?? {}), [fieldId]: value };
      return { ...current, repeated: { ...current.repeated, [groupId]: rows } };
    });
    invalidatePdf();
  }

  function addRepeated(group: DocumentFieldGroup) {
    if (!template || !draft || (draft.repeated[group.id]?.length ?? 0) >= 25) return;
    setDraft((current) => current ? { ...current, repeated: { ...current.repeated, [group.id]: [...(current.repeated[group.id] ?? []), Object.fromEntries(group.fields.map((field) => [field.id, ""]))] } } : current);
    invalidatePdf();
  }

  function removeRepeated(groupId: string, rowIndex: number) {
    setDraft((current) => current ? { ...current, repeated: { ...current.repeated, [groupId]: (current.repeated[groupId] ?? []).filter((_, index) => index !== rowIndex) } } : current);
    invalidatePdf();
  }

  const groups = useMemo(() => template?.sections ?? [], [template]);
  const commonFields = template ? commonFieldsFor(template) : COMMON_FIELDS;
  const requiredMissing = useMemo(() => {
    if (!template || !draft) return [];
    const missing: string[] = [];
    for (const field of commonFieldsFor(template)) if (field.required && !draft.values[field.id]?.trim()) missing.push(field.label);
    for (const group of groups) {
      if (group.repeatable) {
        const rows = draft.repeated[group.id] ?? [];
        const requiredFields = group.fields.filter((field) => field.required !== false);
        const complete = rows.some((row) => requiredFields.every((field) => row[field.id]?.trim()));
        if (requiredFields.length && !complete) missing.push(`${group.label}: complete at least one entry`);
      } else {
        for (const field of group.fields) if (field.required !== false && !draft.values[field.id]?.trim()) missing.push(field.label);
      }
    }
    return missing;
  }, [draft, groups, template]);

  const outline = template && draft ? [
    { id: "caption", label: "Case details", done: commonFieldsFor(template).every((field) => !field.required || Boolean(draft.values[field.id]?.trim())) },
    ...template.sections.map((group) => {
      if (group.repeatable) {
        const rows = draft.repeated[group.id] ?? [];
        const requiredFields = group.fields.filter((field) => field.required !== false);
        return { id: group.id, label: group.label, done: rows.some((row) => requiredFields.every((field) => row[field.id]?.trim())) };
      }
      return { id: group.id, label: group.label, done: group.fields.every((field) => field.required === false || Boolean(draft.values[field.id]?.trim())) };
    }),
  ] : [];
  const activeIndex = Math.max(0, outline.findIndex((item) => item.id === activeSection));

  function renderInput(field: DocumentField, value: string, onChange: (next: string) => void, suffix = "") {
    const inputId = `document-${field.id}${suffix}`;
    return <div className="field" key={inputId}>
      <label htmlFor={inputId}>{field.label}{field.required !== false && <span aria-hidden="true"> *</span>}</label>
      {field.type === "textarea" ? <textarea id={inputId} rows={4} maxLength={6000} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />
        : field.type === "select" ? <select id={inputId} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose…</option>{(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
          : <input id={inputId} type={field.type} min={field.type === "number" ? "0" : undefined} maxLength={field.type === "number" ? undefined : 200} value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />}
      {field.help && <small>{field.help}</small>}
    </div>;
  }

  async function renderPdf() {
    if (!draft || !template || requiredMissing.length) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(template.pdfPath, { cache: "no-store" });
      if (!response.ok) throw new Error("SOURCE_PDF_UNAVAILABLE");
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const output = await PDFDocument.load(await response.arrayBuffer());
      output.setTitle(cleanPdfText(draft.documentName || template.title));
      output.setSubject(cleanPdfText(`Completed ${template.title} DA template`));
      const font = await output.embedFont(StandardFonts.TimesRoman);
      const bold = await output.embedFont(StandardFonts.TimesRomanBold);
      const pageAt = (index: number) => output.getPage(Math.min(index, output.getPageCount() - 1));
      const extraPages: { heading: string; lines: string[] }[] = [];

      const writeRegion = (key: string, heading: string, rows: { label: string; value: string }[]) => {
        const region = template.pdfRegions[key];
        if (!rows.length) return;
        if (!region) {
          extraPages.push({ heading, lines: rows.map((row) => `${row.label}: ${row.value}`) });
          return;
        }
        const page = pageAt(region.page);
        blankRegion(page, region, rgb(1, 1, 1));
        const size = region.fontSize ?? 8.5;
        const lineHeight = size * 1.35;
        const innerWidth = region.width - 8;
        let top = region.top + 4;
        const headingLines = wrapText(heading.toUpperCase(), innerWidth, bold, size);
        for (const line of headingLines) {
          if (top + lineHeight > region.top + region.height - 2) break;
          page.drawText(line, { x: region.x + 4, y: page.getHeight() - top - size - 2, size, font: bold, color: rgb(0.08, 0.08, 0.08) });
          top += lineHeight;
        }
        top += 2;
        for (const row of rows) {
          const content = `${row.label}: ${row.value}`;
          const lines = wrapText(content, innerWidth, font, size);
          for (const line of lines) {
            if (top + lineHeight > region.top + region.height - 2) {
              extraPages.push({ heading, lines: [content] });
              break;
            }
            page.drawText(line, { x: region.x + 4, y: page.getHeight() - top - size - 2, size, font, color: rgb(0.08, 0.08, 0.08) });
            top += lineHeight;
          }
          top += 1;
        }
      };

      const caseNumber = cleanPdfText(draft.values.caseNumber ?? "");
      const captionFields = template.id === "search-warrant" ? ["caseNumber"] : ["caseNumber", "plaintiff", "defendant"];
      for (const id of captionFields) {
        const region = template.pdfRegions[id];
        const value = cleanPdfText(draft.values[id] ?? "");
        if (!region || !value) continue;
        const page = pageAt(region.page);
        blankRegion(page, region, rgb(1, 1, 1));
        const label = id === "caseNumber" ? "ACTION NO." : "";
        const text = label ? `${label} ${value}` : value;
        const size = region.fontSize ?? 9;
        page.drawText(text, { x: region.x + (label ? 1 : 4), y: page.getHeight() - region.top - size - 2, size, font, color: rgb(0.08, 0.08, 0.08) });
      }

      for (const section of template.sections) {
        const regionKey = section.pdfRegion ?? REGION_ALIASES[template.id]?.[section.id] ?? section.id;
        let rows: { label: string; value: string }[] = [];
        if (section.repeatable) {
          rows = (draft.repeated[section.id] ?? []).flatMap((entry, index) => {
            const values = section.fields.map((field) => ({ label: field.label, value: entry[field.id]?.trim() ?? "" })).filter((item) => item.value);
            return values.length ? [{ label: `${section.label} ${index + 1}`, value: values.map((item) => `${item.label}: ${item.value}`).join(" | ") }] : [];
          });
        } else {
          rows = section.fields.map((field) => ({ label: field.label, value: draft.values[field.id]?.trim() ?? "" })).filter((item) => item.value);
        }
        writeRegion(regionKey, section.label, rows);
      }

      if (extraPages.length) {
        let page = output.addPage([612, 792]);
        let y = page.getHeight() - 64;
        const addContinuationPage = () => { page = output.addPage([612, 792]); y = page.getHeight() - 64; };
        const writeContinuationLine = (line: string, size: number, fontToUse = font) => {
          if (y < 58) addContinuationPage();
          page.drawText(cleanPdfText(line), { x: 72, y, size, font: fontToUse, color: rgb(0.08, 0.08, 0.08), maxWidth: 468, lineHeight: size * 1.4 });
          y -= size * 1.55;
        };
        writeContinuationLine(draft.values.caseNumber ? `Case ${draft.values.caseNumber} · ${template.title}` : template.title, 9);
        y -= 12;
        for (const continuation of extraPages) {
          if (y < 92) addContinuationPage();
          writeContinuationLine(continuation.heading, 12, bold);
          for (const value of continuation.lines) {
            const wrapped = wrapText(value, 468, font, 10);
            for (const line of wrapped) writeContinuationLine(line, 10);
            y -= 5;
          }
          y -= 8;
        }
      }

      const bytes = await output.save();
      invalidatePdf();
      setPdfUrl(URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })));
      const name = (draft.documentName || template.title).replace(/[^a-z0-9-_ ]/gi, "").trim().replace(/\s+/g, "-") || "completed-document";
      setPdfName(`${caseNumber ? `${caseNumber}-` : ""}${name}.pdf`);
    } catch (reason) {
      console.error("Could not render the completed DA template", reason);
      setError(reason instanceof Error && reason.message === "SOURCE_PDF_UNAVAILABLE"
        ? "The source document could not be loaded. Your entries are still here; try rendering again."
        : "The completed PDF could not be rendered. Your entries are still here; try again without refreshing.");
    } finally {
      setBusy(false);
    }
  }

  function addRenderedPdfToCase() {
    if (!pdfUrl || !draft || !attachCaseId) return;
    startAddTransition(async () => {
      const blob = await fetch(pdfUrl).then((response) => response.blob());
      const file = new File([blob], pdfName, { type: "application/pdf" });
      const form = new FormData();
      form.set("caseId", attachCaseId);
      form.set("title", draft.documentName.trim() || template?.title || "Completed DA document");
      form.set("pdf", file);
      await addFiling(form);
    });
  }

  if (!template || !draft) {
    return <div className="document-creator">
      <p className="eyebrow">District Attorney document library</p>
      <h1>Start a document</h1>
      <p className="lede">Choose a DA form. Each document has its own fields; the builder fills your entries into the supplied PDF.</p>
      <div className="field document-template-search"><label htmlFor="template-search">Find a DA template</label><input id="template-search" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search title or category" /></div>
      {!filteredTemplates.length ? <div className="empty-state"><p>No templates match that search.</p></div> : categories.map((category) => <section className="document-template-group" key={category} aria-labelledby={`template-category-${category}`}>
        <h2 id={`template-category-${category}`}>{category}</h2>
        <div className="document-template-grid">{filteredTemplates.filter((item) => item.category === category).map((item) => <article className="document-template-card" key={item.id}>
          <button type="button" className="document-template-select" onClick={() => chooseTemplate(item)}><span>{item.title}</span><small>Open this form</small></button>
          <div className="document-template-links"><a href={item.copyUrl} target="_blank" rel="noopener noreferrer">Open the editable source ↗</a></div>
        </article>)}</div>
      </section>)}
    </div>;
  }

  const currentGroup = template.sections.find((section) => section.id === activeSection);
  const selectedRecord = cases.find((item) => item.id === selectedCaseId);
  const initialMissingLabel = requiredMissing.length ? `${requiredMissing.length} required ${requiredMissing.length === 1 ? "field" : "fields"} to complete` : "Ready to render";

  return <div className="document-creator document-builder">
    <div className="document-builder-top">
      <button type="button" className="document-back-link" onClick={() => { invalidatePdf(); setTemplate(null); setDraft(null); }}>‹ All templates</button>
      <div className="field document-draft-name"><label htmlFor="draft-name">Filing title</label><input id="draft-name" value={draft.documentName} maxLength={120} onChange={(event) => { setDraft((current) => current ? { ...current, documentName: event.target.value } : current); invalidatePdf(); }} /></div>
      <span className="document-draft-status" role="status">{pdfUrl ? "PDF ready" : initialMissingLabel}</span>
      <div className="document-builder-tags"><span>{template.title}</span><span>{template.category}</span><span>DA FORM</span></div>
    </div>
    <p className="document-builder-intro">Fill in the case details and the fields for this form. Render only after the required information is complete.</p>
    <div className="document-builder-grid">
      <aside className="document-builder-sidebar">
        <section className="document-panel document-outline"><h2>Outline</h2>
          {outline.map((item) => <button type="button" key={item.id} className={activeSection === item.id ? "document-outline-item is-active" : "document-outline-item"} onClick={() => { setActiveSection(item.id); setError(""); }} aria-current={activeSection === item.id ? "step" : undefined}>
            <span>{item.label}</span><small>{item.done ? "Complete" : "Needs information"}</small>
          </button>)}
          <div className="document-outline-legend"><span>Complete</span><span>Needs information</span></div>
        </section>
        <section className="document-panel document-guidance"><h2>Using this form</h2><p>The provided DA PDF is the base of your completed document. Entered values are placed in its form-specific fields.</p><a href={template.editUrl} target="_blank" rel="noopener noreferrer">View original source ↗</a></section>
      </aside>

      <main className="document-editor">
        {activeSection === "caption" ? <section className="document-panel document-content-section" id="document-section-caption">
          <header className="document-panel-heading"><h2>Case details</h2><span>Printed in the court caption</span></header>
          <div className="field"><label htmlFor="document-case-select">Fill from a case (optional)</label><select id="document-case-select" value={selectedCaseId} onChange={(event) => selectCase(event.target.value)}><option value="">Enter case details manually</option>{cases.map((record) => <option key={record.id} value={record.id}>{record.caseNumber} · {record.title}</option>)}</select><small>Choosing a case fills its number and parties. You can still edit them below.</small></div>
          {commonFields.map((field) => renderInput(field, draft.values[field.id] ?? "", (value) => updateValue(field.id, value)))}
          {selectedRecord && <p className="message">Selected docket: {selectedRecord.caseNumber} · {selectedRecord.title}{selectedRecord.type ? ` · ${selectedRecord.type}` : ""}</p>}
        </section> : currentGroup ? <section className="document-panel document-content-section" id={`document-section-${currentGroup.id}`}>
          <header className="document-panel-heading"><h2>{currentGroup.label}</h2><span>{template.title}</span></header>
          <p className="document-instruction">{currentGroup.hint}</p>
          {currentGroup.repeatable ? <div className="document-structured-list">
            {(draft.repeated[currentGroup.id] ?? []).map((row, rowIndex) => <fieldset className="document-entry-card" key={`${currentGroup.id}-${rowIndex}`}><legend>{currentGroup.label} {rowIndex + 1}</legend>
              <div className="document-form-grid">{currentGroup.fields.map((field) => renderInput(field, row[field.id] ?? "", (value) => updateRepeated(currentGroup.id, rowIndex, field.id, value), `-${rowIndex}`))}</div>
              {(draft.repeated[currentGroup.id]?.length ?? 0) > 1 && <button type="button" className="govbtn-outline document-remove-paragraph" onClick={() => removeRepeated(currentGroup.id, rowIndex)}>Remove this entry</button>}
            </fieldset>)}
            <button type="button" className="govbtn-outline" disabled={(draft.repeated[currentGroup.id]?.length ?? 0) >= 25} onClick={() => addRepeated(currentGroup)}>＋ Add {currentGroup.id === "counts" ? "count" : currentGroup.id === "witnesses" ? "witness" : currentGroup.id === "items" ? "evidence item" : currentGroup.id === "arrests" ? "arrest entry" : currentGroup.id === "statements" ? "statement" : currentGroup.id === "evidence" ? "item" : "entry"}</button>
          </div> : <div className="document-form-grid">{currentGroup.fields.map((field) => renderInput(field, draft.values[field.id] ?? "", (value) => updateValue(field.id, value)))}</div>}
        </section> : null}
        <nav className="document-section-nav" aria-label="Document sections">
          <button type="button" className="govbtn-outline" disabled={activeIndex <= 0} onClick={() => setActiveSection(outline[Math.max(0, activeIndex - 1)]?.id ?? "caption")}>Back</button>
          <span>Section {activeIndex + 1} of {outline.length}</span>
          <button type="button" className="govbtn" disabled={activeIndex >= outline.length - 1} onClick={() => setActiveSection(outline[Math.min(outline.length - 1, activeIndex + 1)]?.id ?? "caption")}>Next section</button>
        </nav>
      </main>

      <aside className="document-builder-aside">
        <section className="document-panel document-compliance"><header className="document-panel-heading"><h2>Before rendering</h2><span className={requiredMissing.length ? "document-count document-count-warning" : "document-count"}>{requiredMissing.length ? `${requiredMissing.length} to complete` : "Ready"}</span></header>
          {requiredMissing.length ? <><p>Complete these required fields first:</p><ul className="document-missing-list">{requiredMissing.slice(0, 10).map((name) => <li key={name}>{name}</li>)}</ul>{requiredMissing.length > 10 && <p>And {requiredMissing.length - 10} more.</p>}</> : <p className="message message-success">Required fields are complete.</p>}
          <p className="document-instruction">A required field is one the supplied form needs to identify the case, party, charge, request, or signer.</p>
        </section>
        <section className="document-panel document-preview"><header className="document-panel-heading"><h2>Completed PDF</h2><span>{pdfUrl ? "Ready" : "Not rendered"}</span></header>
          <p className="document-instruction">Your entries are rendered onto the supplied DA PDF. Nothing is added to a case until you choose one below.</p>
          <div className="document-preview-actions"><button className="govbtn" type="button" onClick={() => void renderPdf()} disabled={busy || requiredMissing.length > 0}>{busy ? "Rendering PDF…" : pdfUrl ? "Render PDF again" : "Render PDF"}</button>{pdfUrl && <a className="govbtn-outline" href={pdfUrl} download={pdfName}>Download PDF</a>}</div>
          {error && <p className="message message-error" role="alert">{error}</p>}
          {pdfUrl && <div className="document-add-to-case"><h3>Add to a case</h3><div className="field"><label htmlFor="attach-case">Case docket</label><select id="attach-case" value={attachCaseId} onChange={(event) => setAttachCaseId(event.target.value)}><option value="">Choose a case…</option>{cases.map((record) => <option key={record.id} value={record.id}>{record.caseNumber} · {record.title}</option>)}</select></div><p className="document-instruction">The filing title is filled in from this document. Case access and normal filing review rules still apply.</p><button type="button" className="govbtn" disabled={!attachCaseId || isAdding} onClick={addRenderedPdfToCase}>{isAdding ? "Adding to case…" : "Add PDF to case"}</button></div>}
          {pdfUrl ? <iframe className="document-pdf-frame" title="Completed DA form PDF" src={pdfUrl} /> : <div className="document-preview-empty">Complete the required fields, then render the PDF to preview it here.</div>}
        </section>
        <p className="document-disclaimer">Your unfinished entries stay in this page only. Download the rendered PDF before leaving if you need a separate copy.</p>
      </aside>
    </div>
  </div>;
}
