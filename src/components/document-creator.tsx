"use client";

import { useMemo, useState } from "react";
import { DOCUMENT_TEMPLATES, type DocumentTemplate } from "@/config/document-templates";

export function DocumentCreator() {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<DocumentTemplate | null>(null);
  const filteredTemplates = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase();
    return query
      ? DOCUMENT_TEMPLATES.filter((template) => `${template.title} ${template.category}`.toLocaleLowerCase().includes(query))
      : DOCUMENT_TEMPLATES;
  }, [filter]);
  const categories = Array.from(new Set(filteredTemplates.map((template) => template.category)));

  if (selected) {
    return (
      <div className="document-creator">
        <button type="button" className="govbtn-outline document-back" onClick={() => setSelected(null)}>
          Back to templates
        </button>
        <header className="document-source-heading">
          <div>
            <p className="eyebrow">Official DA template · {selected.category}</p>
            <h1>{selected.title}</h1>
            <p className="lede">This preview and download use the supplied source PDF without recreating its layout.</p>
          </div>
          <div className="document-source-actions">
            <a className="govbtn" href={selected.copyUrl} target="_blank" rel="noopener noreferrer">Make an editable Google Docs copy</a>
            <a className="govbtn-outline" href={selected.pdfPath} download={`${selected.id}.pdf`}>Download exact PDF</a>
            <a className="document-source-link" href={selected.editUrl} target="_blank" rel="noopener noreferrer">Open source document</a>
          </div>
        </header>
        <p className="message message-info document-source-notice">
          The PDF is the original template, not a generated filing. To enter case-specific information, make an editable copy in Google Docs. The website does not alter or submit the source document.
        </p>
        <section className="document-source-preview" aria-label={`${selected.title} official PDF preview`}>
          <iframe title={`${selected.title} official PDF`} src={selected.pdfPath} />
        </section>
      </div>
    );
  }

  return (
    <div className="document-creator">
      <p className="eyebrow">District Attorney document library</p>
      <h1>DA Templates</h1>
      <p className="lede">Choose a source template to preview its original PDF or open an editable copy.</p>
      <div className="field document-template-search">
        <label htmlFor="template-search">Find a template</label>
        <input id="template-search" type="search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Search title or category" />
      </div>
      {!filteredTemplates.length ? (
        <div className="empty-state"><p>No templates match that search.</p></div>
      ) : categories.map((category) => (
        <section className="document-template-group" key={category} aria-labelledby={`template-category-${category}`}>
          <h2 id={`template-category-${category}`}>{category}</h2>
          <div className="document-template-grid">
            {filteredTemplates.filter((template) => template.category === category).map((template) => (
              <article className="document-template-card" key={template.id}>
                <button type="button" className="document-template-select" onClick={() => setSelected(template)}>
                  <span>{template.title}</span>
                  <small>Preview the exact official PDF</small>
                </button>
                <div className="document-template-links">
                  <a href={template.copyUrl} target="_blank" rel="noopener noreferrer">Make an editable copy ↗</a>
                  <a href={template.pdfPath} download={`${template.id}.pdf`}>Download PDF</a>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      <p className="document-disclaimer">These are the source templates supplied by the District Attorney&apos;s Office. Use the Google Docs copy to fill in case details; the website does not save, file, or send your edits.</p>
    </div>
  );
}
