"use client";

import { useFormStatus } from "react-dom";

export function PendingSubmitButton({ label, pendingLabel, className = "govbtn", name, value }: { label: string; pendingLabel: string; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} name={name} value={value} aria-live="polite">{pending ? pendingLabel : label}</button>;
}
