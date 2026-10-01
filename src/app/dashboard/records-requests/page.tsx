import { redirect } from "next/navigation";

export default function RecordsRequestsPage() {
  redirect("/dashboard/review?type=records");
}
