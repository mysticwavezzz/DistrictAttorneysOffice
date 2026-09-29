"use client";

import { useRef, useState, useTransition } from "react";
import { clearAllData } from "./actions";
import { CLEAR_DATA_CONFIRMATION } from "./constants";

export function ClearDataForm() {
  const [value, setValue] = useState("");
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const matches = value === CLEAR_DATA_CONFIRMATION;

  return (
    <form
      action={(formData) => {
        if (submittingRef.current || !matches) return;
        submittingRef.current = true;
        startTransition(async () => {
          try {
            await clearAllData(formData);
            setValue("");
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
    </form>
  );
}
