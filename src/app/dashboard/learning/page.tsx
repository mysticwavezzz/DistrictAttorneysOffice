import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { CAPABILITIES, hasCapability } from "@/lib/permissions";
import { LearningCourse } from "@/components/learning-course";
import { staffPageMetadata } from "@/lib/staff-metadata";
import { getOnboardingAccessTiers } from "@/lib/onboarding-access";

export const metadata = staffPageMetadata("Criminal Division Learning Course", "Complete the required Criminal Division course and final mock trial.", "/dashboard/learning");

export default async function LearningPage() {
  const session = await auth();
  const tiers = await getOnboardingAccessTiers(session?.user?.robloxUserId, session?.user?.tiers ?? []);
  if (!session?.user?.providerUserId || !hasCapability(tiers, CAPABILITIES.TRAINING_VIEW)) redirect("/login?error=forbidden");
  return <LearningCourse />;
}
