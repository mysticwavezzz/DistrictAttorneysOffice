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
}

export function RemoveButton({
  id,
  action,
  label = "Remove",
  pendingLabel = "Removing…",
  className = "linklike",
  style,
  formStyle,
}: RemoveButtonProps) {
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);

  return (
    <form
      style={formStyle}
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
