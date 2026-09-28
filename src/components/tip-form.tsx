"use client";

import { useRef, useState, type FormEvent } from "react";

type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

const DETAILS_MIN_LENGTH = 20;
const DETAILS_MAX_LENGTH = 4000;

export function TipForm() {
  const [state, setState] = useState<SubmitState>({ status: "idle" });
  const renderedAtRef = useRef(Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status === "submitting") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const details = String(data.get("details") ?? "").trim();

    if (details.length < DETAILS_MIN_LENGTH) {
      setState({
        status: "error",
        message: `Please provide at least ${DETAILS_MIN_LENGTH} characters of detail.`,
      });
      return;
    }

    setState({ status: "submitting" });

    try {
      const res = await fetch("/api/tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? ""),
          contact: String(data.get("contact") ?? ""),
          location: String(data.get("location") ?? ""),
          details,
          website: String(data.get("website") ?? ""),
          renderedAt: renderedAtRef.current,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!res.ok || !json?.success) {
        setState({
          status: "error",
          message: json?.error ?? "We couldn't submit your tip. Please try again.",
        });
        return;
      }

      setState({ status: "success" });
      formRef.current?.reset();
      renderedAtRef.current = Date.now();
    } catch {
      setState({
        status: "error",
        message: "A network error occurred. Please check your connection and try again.",
      });
    }
  }

  if (state.status === "success") {
    return (
      <div className="message message-success" role="status">
        <strong>Tip received.</strong> Thank you — your information has been submitted to our
        office for review.{" "}
        <button
          type="button"
          onClick={() => setState({ status: "idle" })}
          className="login-link"
          style={{ background: "none", border: 0, padding: 0, cursor: "pointer", font: "inherit" }}
        >
          Submit another tip
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="formbox" noValidate>
      {/* Honeypot: hidden from sighted users and excluded from the tab
          order; a filled value marks the submission as automated. */}
      <div style={{ position: "absolute", left: "-9999px" }} aria-hidden="true">
        <label htmlFor="website">Leave this field blank</label>
        <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="field">
        <label htmlFor="name">
          Name <span className="hint">(optional — you may remain anonymous)</span>
        </label>
        <input type="text" id="name" name="name" maxLength={100} />
      </div>

      <div className="field">
        <label htmlFor="contact">
          Contact Information <span className="hint">(optional)</span>
        </label>
        <input
          type="text"
          id="contact"
          name="contact"
          maxLength={200}
          placeholder="Phone number or email, if you'd like a follow-up"
        />
      </div>

      <div className="field">
        <label htmlFor="location">
          Location of Incident <span className="hint">(optional)</span>
        </label>
        <input type="text" id="location" name="location" maxLength={200} />
      </div>

      <div className="field">
        <label htmlFor="details">Tip Details *</label>
        <textarea
          id="details"
          name="details"
          required
          minLength={DETAILS_MIN_LENGTH}
          maxLength={DETAILS_MAX_LENGTH}
          rows={6}
          placeholder="Please describe what you know. Include dates, locations, and any names if available."
        />
      </div>

      {state.status === "error" && (
        <p role="alert" className="message message-error">
          {state.message}
        </p>
      )}

      <button type="submit" disabled={state.status === "submitting"} className="govbtn">
        {state.status === "submitting" ? "Submitting…" : "Submit Tip"}
      </button>

      <p className="note-inline" style={{ marginTop: 10 }}>
        Submissions are routed to office staff for review. For emergencies, always call 911.
      </p>
    </form>
  );
}
