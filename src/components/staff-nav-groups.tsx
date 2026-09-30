"use client";

import { NavLinks } from "./nav-links";
import type { NavItem } from "./site-header";

export function StaffNavGroups({ groups }: { groups: { label: string; items: NavItem[] }[] }) {
  return (
    <ul className="staff-nav-groups">
      {groups.map((group) => (
        <li key={group.label} className="staff-nav-group">
          <h4>{group.label}</h4>
          <ul><NavLinks items={group.items} asListItems /></ul>
        </li>
      ))}
    </ul>
  );
}
