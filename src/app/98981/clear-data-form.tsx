"use client";

import { useRef, useState, useTransition } from "react";
import { clearAllData } from "./actions";
import { CLEAR_DATA_CONFIRMATION } from "./constants";

export function ClearDataForm() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const matches = value === CLEAR_DATA_CONFIRMATION;

  return (
    <form
      action={(formData) => {
        if (submittingRef.current || !matches) return;
        submittingRef.current = true;
        setMessage("");
        setError(false);
        startTransition(async () => {
          try {
            const result = await clearAllData(formData);
            setValue("");
            const total = result.deleted.cases + result.deleted.aopcs + result.deleted.announcements + result.deleted.recordsRequests + result.deleted.notifications;
            setMessage(`Data cleared successfully. Removed ${total} records and ${result.deleted.related} related case records. Staff accounts and roster were kept.`);
          } catch (cause) {
            setError(true);
            setMessage(cause instanceof Error ? cause.message : "The data could not be cleared. No changes were confirmed.");
          } finally {
            submittingRef.current = false;
          }
        });
      }}
    >
      <div className="field">
        <label htmlFor="confirmation">
          Type <code>{CLEAR_DATA_CONFIRMATION}</code> to confirm
        </label>
        <input
          type="text"
          id="confirmation"
          name="confirmation"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      <button
        type="submit"
        className="govbtn"
        style={{ background: "var(--down)", borderColor: "#6b2018" }}
        disabled={!matches || isPending}
      >
        {isPending ? "Clearing…" : "Clear All Case & Content Data"}
      </button>
      {message && <p role="status" aria-live="polite" style={{ color: error ? "var(--down)" : "var(--up)" }}>{message}</p>}
    </form>
  );
}
