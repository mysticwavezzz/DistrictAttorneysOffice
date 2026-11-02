import { redirect } from "next/navigation";

export default async function DashboardOverviewPage({ searchParams }: { searchParams: Promise<{ caseSubmitted?: string }> }) {
  const query = await searchParams;
  redirect(query.caseSubmitted === "review" ? "/dashboard/work-queue?caseSubmitted=review" : "/dashboard/work-queue");
}
