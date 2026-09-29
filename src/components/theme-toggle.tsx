"use client";

import { useEffect, useState } from "react";

const THEMES = ["auto", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];

const STORAGE_KEY = "da-theme";

function resolveEffective(theme: Theme): "light" | "dark" {
  if (theme === "auto") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function apply(theme: Theme) {
  document.documentElement.setAttribute("data-theme", resolveEffective(theme));
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "auto" || stored === "light" || stored === "dark") {
        setTheme(stored);
      }
    } catch {
      // localStorage unavailable — default theme still renders fine
    }
  }, []);

  useEffect(() => {
    apply(theme);
    if (theme !== "auto") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("auto");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  function handleSet(next: Theme) {
    setTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best-effort persistence only
    }
  }

  const labels: Record<Theme, string> = { auto: "Auto", light: "Light", dark: "Dark" };

  return (
    <span className="sz">
      <span>Theme:</span>
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          className="m"
          aria-pressed={theme === t}
          onClick={() => handleSet(t)}
        >
          {labels[t]}
        </button>
      ))}
    </span>
  );
}
