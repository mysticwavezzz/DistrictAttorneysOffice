import { redirect } from "next/navigation";

export default function CaseRequestsPage() {
  redirect("/dashboard/review?type=case");
}
