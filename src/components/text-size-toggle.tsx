"use client";

import { useEffect, useState } from "react";

const SIZES = ["s", "m", "l"] as const;
type Size = (typeof SIZES)[number];

const STORAGE_KEY = "da-text-size";

function applySize(size: Size) {
  document.documentElement.classList.remove("tsz-s", "tsz-l");
  if (size === "s") document.documentElement.classList.add("tsz-s");
  if (size === "l") document.documentElement.classList.add("tsz-l");
}

export function TextSizeToggle() {
  const [size, setSize] = useState<Size>("m");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "s" || stored === "m" || stored === "l") {
        setSize(stored);
        applySize(stored);
      }
    } catch {
      // localStorage unavailable. The default size still renders.
    }
  }, []);

  function handleSet(next: Size) {
    setSize(next);
    applySize(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort persistence only
    }
  }

  return (
    <span className="sz">
      <span>Text size:</span>
      <button type="button" className="s" aria-pressed={size === "s"} onClick={() => handleSet("s")}>
        A
      </button>
      <button type="button" className="m" aria-pressed={size === "m"} onClick={() => handleSet("m")}>
        A
      </button>
      <button type="button" className="l" aria-pressed={size === "l"} onClick={() => handleSet("l")}>
        A
      </button>
    </span>
  );
}
