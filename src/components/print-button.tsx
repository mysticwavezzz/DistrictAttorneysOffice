"use client";

export function PrintButton() {
  return <button type="button" className="govbtn-outline screen-only" onClick={() => window.print()}>Print / Save PDF</button>;
}
