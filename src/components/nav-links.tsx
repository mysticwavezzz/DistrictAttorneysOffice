"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { NavItem } from "./site-header";

export function NavLinks({ items, asListItems = false }: { items: readonly NavItem[]; asListItems?: boolean }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const queryMatch = items
    .map((item) => ({ item, url: new URL(item.href, "https://local.invalid") }))
    .filter(({ url }) => url.search && pathname === url.pathname && [...url.searchParams].every(([key, value]) => search.get(key) === value))
    .sort((a, b) => b.url.search.length - a.url.search.length)[0]?.item.href;
  const active = queryMatch ?? items
    .map((item) => ({ item, path: new URL(item.href, "https://local.invalid").pathname }))
    .filter(({ item, path }) => !new URL(item.href, "https://local.invalid").search && (pathname === path || (path !== "/dashboard" && pathname.startsWith(`${path}/`))))
    .sort((a, b) => b.path.length - a.path.length)[0]?.item.href;

  return (
    <>
      {items.map((item) => {
        const link = <Link key={item.href} href={item.href} className={item.href === active ? "on" : undefined} aria-current={item.href === active ? "page" : undefined}>{item.label}</Link>;
        return asListItems ? <li key={item.href}>{link}</li> : link;
      })}
    </>
  );
}
