"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "./site-header";

export function NavLinks({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={item.href === active ? "on" : undefined}>
          {item.label}
        </Link>
      ))}
    </>
  );
}
