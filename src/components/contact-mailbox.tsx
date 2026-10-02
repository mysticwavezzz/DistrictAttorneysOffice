"use client";

import { useCallback, useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createContactTicket, sendContactReply } from "@/app/contacts/actions";

type Message = { id: string; body: string; createdAt: string; author: { id: string; username: string } };
type Ticket = { id: string; subject: string; status: string; createdAt: string; updatedAt: string; messages: Message[] };
type FullTicket = Ticket & { messages: Message[] };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function ContactMailbox({ initialTickets, initialTicketId, currentUserId }: { initialTickets: Ticket[]; initialTicketId: string | null; currentUserId: string }) {
  const router = useRouter();
  const [tickets, setTickets] = useState(initialTickets);
  const [selectedId, setSelectedId] = useState(initialTicketId && initialTickets.some((ticket) => ticket.id === initialTicketId) ? initialTicketId : null);
  const [activeTicket, setActiveTicket] = useState<FullTicket | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(async (ticketId?: string | null) => {
    try {
      const response = await fetch(`/api/contact/tickets${ticketId ? `?ticket=${encodeURIComponent(ticketId)}` : ""}`, { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json() as { tickets: Ticket[]; ticket?: FullTicket };
      setTickets(data.tickets);
      if (data.ticket) setActiveTicket(data.ticket);
    } catch { /* Keep the last saved conversation visible during a temporary network failure. */ }
  }, []);

  useEffect(() => {
    void refresh(selectedId);
    const interval = window.setInterval(() => void refresh(selectedId), selectedId ? 4000 : 20000);
    return () => window.clearInterval(interval);
  }, [refresh, selectedId]);

  function submitNewTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        const id = await createContactTicket(data);
        form.reset();
        setSelectedId(id);
        router.replace(`/contacts?ticket=${encodeURIComponent(id)}`, { scroll: false });
        await refresh(id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The message could not be sent. Please try again.");
      }
    });
  }

  function submitReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError("");
    startTransition(async () => {
      try {
        await sendContactReply(selectedId, data);
        form.reset();
        await refresh(selectedId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Your reply could not be sent. Please try again.");
      }
    });
  }

  const selected = tickets.find((ticket) => ticket.id === selectedId);
  return <section className="contact-mailbox" aria-label="Contact mailbox">
    <div className="contact-ticket-list">
      <h2>Your messages</h2>
      {!tickets.some((ticket) => ticket.status !== "CLOSED") && <p className="empty-state">No open tickets.</p>}
      {tickets.filter((ticket) => ticket.status !== "CLOSED").map((ticket) => <button type="button" className={`contact-ticket-choice ${selectedId === ticket.id ? "is-selected" : ""}`} key={ticket.id} onClick={() => { setSelectedId(ticket.id); setActiveTicket(null); router.replace(`/contacts?ticket=${encodeURIComponent(ticket.id)}`, { scroll: false }); }}>
        <span><strong>{ticket.subject}</strong><span className="pill pill-navy">{ticket.status === "ON_HOLD" ? "On hold" : "Open"}</span></span>
        <small>{ticket.messages[0]?.body.slice(0, 140) || "No messages yet"}</small>
        <time dateTime={ticket.updatedAt}>{dateFormat.format(new Date(ticket.updatedAt))}</time>
      </button>)}
      {tickets.some((ticket) => ticket.status === "CLOSED") && <details className="contact-closed-list"><summary>Recently closed messages ({tickets.filter((ticket) => ticket.status === "CLOSED").length})</summary>{tickets.filter((ticket) => ticket.status === "CLOSED").map((ticket) => <button type="button" className={`contact-ticket-choice ${selectedId === ticket.id ? "is-selected" : ""}`} key={ticket.id} onClick={() => { setSelectedId(ticket.id); setActiveTicket(null); router.replace(`/contacts?ticket=${encodeURIComponent(ticket.id)}`, { scroll: false }); }}><span><strong>{ticket.subject}</strong><span className="pill pill-muted">Closed</span></span><small>Latest reply: {ticket.messages[0]?.body.slice(0, 140) || "No replies"}</small></button>)}</details>}
    </div>
    <div className="contact-ticket-content">
      {selectedId && selected ? <>
        <header className="contact-ticket-header"><div><h2>{selected.subject}</h2><p>Ticket {selected.id} · {selected.status === "ON_HOLD" ? "On hold" : selected.status.toLowerCase()}</p></div><button type="button" className="govbtn-outline" onClick={() => { setSelectedId(null); setActiveTicket(null); router.replace("/contacts", { scroll: false }); }}>Close view</button></header>
        <div className="contact-message-thread" aria-live="polite" aria-relevant="additions text">
          {(activeTicket?.messages ?? []).map((message) => <article className={`contact-message ${message.author.id === currentUserId ? "contact-message-own" : ""}`} key={message.id}><header><strong>{message.author.id === currentUserId ? "You" : message.author.username}</strong><time dateTime={message.createdAt}>{dateFormat.format(new Date(message.createdAt))}</time></header><p>{message.body}</p></article>)}
          {!activeTicket?.messages.length && <p className="note-inline">Loading conversation…</p>}
        </div>
        {selected.status !== "CLOSED" ? <form className="contact-message-form" onSubmit={submitReply}><label htmlFor="contact-reply">Reply</label><textarea id="contact-reply" name="message" maxLength={8000} rows={4} required/><button type="submit" className="govbtn" disabled={pending}>{pending ? "Sending…" : "Send reply"}</button></form> : <p className="message">This ticket is closed.</p>}
      </> : <>
        <h2>Send a message</h2>
        {!tickets.some((ticket) => ticket.status !== "CLOSED") && <p className="note-inline">No open tickets. Send a message to start a new conversation.</p>}
        <form className="contact-message-form" onSubmit={submitNewTicket}><label htmlFor="contact-subject">Subject</label><input id="contact-subject" name="subject" maxLength={120} minLength={3} required/><label htmlFor="contact-message">Message</label><textarea id="contact-message" name="message" maxLength={8000} minLength={5} rows={7} required/><button type="submit" className="govbtn" disabled={pending}>{pending ? "Sending…" : "Send to the office"}</button></form>
      </>}
      {error && <p className="message message-error" role="alert">{error}</p>}
      <p className="note-inline" role="status">Messages refresh automatically while this page is open.</p>
    </div>
  </section>;
}
