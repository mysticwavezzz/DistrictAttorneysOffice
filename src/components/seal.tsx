import { siteConfig } from "@/config/site";

interface SealProps {
  className?: string;
}

/**
 * Placeholder office seal/crest, drawn inline as SVG. Swap the `<circle>`
 * / `<path>` content for the office's real seal artwork when available —
 * every consumer just renders `<Seal />`, so the visual can change without
 * touching the header, letter, or footer that use it. Color comes from
 * `currentColor`, so it inherits whatever the `.seal`/`.seal-sm` wrapper
 * sets rather than needing a color className at each call site.
 */
export function Seal({ className }: SealProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`${siteConfig.county} ${siteConfig.name} seal`}
    >
      <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="50" cy="50" r="41" fill="none" stroke="currentColor" strokeWidth="1" />
      <path
        d="M50 20 L58 42 L82 42 L62 56 L70 78 L50 64 L30 78 L38 56 L18 42 L42 42 Z"
        fill="currentColor"
      />
      <text
        x="50"
        y="93"
        textAnchor="middle"
        fontSize="7"
        letterSpacing="1"
        fill="currentColor"
        fontFamily="serif"
      >
        EST. JUSTICE
      </text>
    </svg>
  );
}
