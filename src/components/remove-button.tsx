"use client";

import { useRef, useTransition } from "react";

interface RemoveButtonProps {
  id: string;
  action: (formData: FormData) => Promise<void>;
  label?: string;
  pendingLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  formStyle?: React.CSSProperties;
  confirmMessage?: string;
}

export function RemoveButton({
  id,
  action,
  label = "Remove",
  pendingLabel = "Removing…",
  className = "linklike",
  style,
  formStyle,
  confirmMessage = "Remove this item? This action may not be reversible.",
}: RemoveButtonProps) {
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  return (
    <form
      style={formStyle}
      onSubmit={(event) => {
        if (!window.confirm(confirmMessage)) event.preventDefault();
      }}
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
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={className} style={style} disabled={isPending}>
        {isPending ? pendingLabel : label}
      </button>
    </form>
  );
}
