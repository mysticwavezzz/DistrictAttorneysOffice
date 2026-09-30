import { redirect } from "next/navigation";

/** Retire the former AOPC workspace in favor of opening and filing a case. */
export default function LegacyAffidavitsPage() {
  redirect("/dashboard/cases/new");
}
