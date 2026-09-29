"use client";

import { useRef, useTransition } from "react";

interface FormWithPendingSubmitProps {
  action: (formData: FormData) => Promise<void>;
  submitLabel: string;
  pendingLabel: string;
  className?: string;
  submitClassName?: string;
  children: React.ReactNode;
}

export function FormWithPendingSubmit({
  action,
  submitLabel,
  pendingLabel,
  className,
  submitClassName = "govbtn",
  children,
}: FormWithPendingSubmitProps) {
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  return (
    <form
      className={className}
      action={(formData) => {
        if (submittingRef.current) return;
        submittingRef.current = true;
        startTransition(async () => {
          try {
            await action(formData);
          } finally {
            submittingRef.current = false;
          }
        });
      }}
    >
      {children}
      <button type="submit" className={submitClassName} disabled={isPending}>
        {isPending ? pendingLabel : submitLabel}
      </button>
    </form>
  );
}
