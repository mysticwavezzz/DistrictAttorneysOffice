"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export function RoleSyncButton() {
  const { update } = useSession();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setPending(true);
    setMessage("");
    try {
      await update();
      setMessage(`Roles checked at ${new Date().toLocaleTimeString()}.`);
      router.refresh();
    } catch {
      setMessage("Role sync failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return <div><button className="govbtn-outline" type="button" onClick={sync} disabled={pending}>{pending ? "Syncing…" : "Sync Discord roles now"}</button>{message && <p className="note-inline" role="status">{message}</p>}</div>;
}
