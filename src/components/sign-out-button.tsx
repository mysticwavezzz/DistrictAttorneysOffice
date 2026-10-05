"use client";

import { signOut } from "next-auth/react";
import { clearDashboardFoldPreferences } from "@/lib/ui-preferences";

export function SignOutButton({
  redirectTo = "/",
  className = "",
  children = "Sign out",
}: {
  redirectTo?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return <button type="button" className={className} onClick={() => {
    clearDashboardFoldPreferences();
    void signOut({ redirectTo });
  }}>{children}</button>;
}
