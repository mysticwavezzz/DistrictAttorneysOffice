import { redirect } from "next/navigation";

/** Legacy bookmark: route staff to their personalized work queue instead of a static org chart. */
export default function LegacyOrganizationPageRedirect() {
  redirect("/dashboard/work-queue");
}
