"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavItem } from "./site-header";

export type StaffToolGroup = { label: string; items: NavItem[] };

export function StaffToolsMenu({ groups }: { groups: StaffToolGroup[] }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const activeGroup = groups.findIndex((group) => group.items.some((item) => {
    const url = new URL(item.href, "https://local.invalid");
    if (pathname !== url.pathname && !pathname.startsWith(`${url.pathname}/`)) return false;
    return [...url.searchParams].every(([key, value]) => search.get(key) === value);
  }));

  return (
    <details className="staff-tools-menu">
      <summary>More</summary>
      <div className="staff-tools-panel">
        {groups.map((group, index) => (
          <details className="staff-tools-group" key={group.label} open={index === activeGroup}>
            <summary>{group.label}</summary>
            <div className="staff-tools-group-links">
              {group.items.map((item) => {
                const url = new URL(item.href, "https://local.invalid");
                const active = pathname === url.pathname
                  && [...url.searchParams].every(([key, value]) => search.get(key) === value);
                return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
              })}
            </div>
          </details>
        ))}
      </div>
    </details>
  );
}
