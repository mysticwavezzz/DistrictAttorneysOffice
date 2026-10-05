import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canViewCases } from "@/lib/case-access";
import { DocumentCreator } from "@/components/document-creator";

export const metadata: Metadata = { title: "Document Creator" };

export default async function DocumentCreatorPage() {
  const session = await auth();
  if (!session?.user || !canViewCases(session.user.tiers)) redirect("/login?error=forbidden");
  return <DocumentCreator />;
}
