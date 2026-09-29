"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

const POLL_INTERVAL_MS = 15_000;

interface NotificationItem {
  id: string;
  title: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/notifications", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        setUnreadCount(data.unreadCount ?? 0);
        setItems(data.items ?? []);
      } catch {
        // best-effort — a failed poll just tries again next interval
      }
    }

    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
          <path
            d="M10 2.5c-2.2 0-4 1.8-4 4v2.3c0 .5-.2 1-.5 1.4l-1.2 1.5c-.5.6 0 1.5.8 1.5h9.8c.8 0 1.3-.9.8-1.5l-1.2-1.5c-.3-.4-.5-.9-.5-1.4V6.5c0-2.2-1.8-4-4-4z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path
            d="M8.2 15.5a1.8 1.8 0 0 0 3.6 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-panel">
          {items.length === 0 ? (
            <div className="notif-empty">No notifications yet.</div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/settings#notifications"}
                className="notif-item"
                onClick={() => setOpen(false)}
              >
                {!n.isRead && <span className="notif-dot" />}
                {n.title}
              </Link>
            ))
          )}
          <Link href="/settings#notifications" className="notif-viewall" onClick={() => setOpen(false)}>
            Notifications &amp; preferences
          </Link>
        </div>
      )}
    </div>
  );
}
