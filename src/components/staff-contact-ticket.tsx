"use client";

import { useCallback, useEffect, useState, useTransition, type FormEvent } from "react";
import { sendContactReply } from "@/app/contacts/actions";

type Message = { id: string; body: string; createdAt: string; author: { id: string; username: string } };
type Ticket = { id: string; subject: string; status: string; requesterId: string; assigneeId: string | null; messages: Message[] };
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function StaffContactTicket({ initialTicket, currentUserId }: { initialTicket: Ticket; currentUserId: string }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/contact/tickets?ticket=${encodeURIComponent(initialTicket.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { ticket?: Ticket };
      if (data.ticket) setTicket(data.ticket);
    } catch { /* Keep the last saved thread visible while offline. */ }
  }, [initialTicket.id]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  function reply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    startTransition(async () => {
      try { await sendContactReply(ticket.id, data); form.reset(); await refresh(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Reply failed. Retry in a moment."); }
    });
  }

  return <>
    <div className="contact-message-thread" aria-live="polite" aria-relevant="additions text">{ticket.messages.map((message) => <article className={`contact-message ${message.author.id === currentUserId ? "contact-message-own" : ""}`} key={message.id}><header><strong>{message.author.id === currentUserId ? "You" : message.author.username}</strong><time dateTime={message.createdAt}>{dateFormat.format(new Date(message.createdAt))}</time></header><p>{message.body}</p></article>)}</div>
    {ticket.status !== "CLOSED" && <form className="contact-message-form" onSubmit={reply}><label htmlFor="staff-contact-reply">Reply to requester</label><textarea id="staff-contact-reply" name="message" maxLength={8000} rows={4} required/><button type="submit" className="govbtn" disabled={pending}>{pending ? "Sending…" : "Send reply"}</button></form>}
    {error && <p className="message message-error" role="alert">{error}</p>}
    <p className="note-inline" role="status">New messages appear automatically while this page is open.</p>
  </>;
}
