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
        className="linklike"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      >
        Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
      </button>

      {open && (
        <div className="notif-panel">
          {items.length === 0 ? (
            <div className="notif-empty">No notifications yet.</div>
          ) : (
            items.map((n) => (
              <Link
                key={n.id}
                href={n.link ?? "/dashboard/notifications"}
                className="notif-item"
                onClick={() => setOpen(false)}
              >
                {!n.isRead && <span className="notif-dot" />}
                {n.title}
              </Link>
            ))
          )}
          <Link href="/dashboard/notifications" className="notif-viewall" onClick={() => setOpen(false)}>
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
