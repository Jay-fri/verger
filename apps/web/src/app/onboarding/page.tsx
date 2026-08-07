import { redirect } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/session";
import { getActiveMembership } from "@/lib/auth/membership";
import { AuthCard, CardEyebrow, CardTitle, CardSubtitle } from "@/components/ui";
import { CreateChurchForm } from "./create-church-form";

// Depends on the request's session cookie — never statically prerender.
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireVerifiedUser("/onboarding");
  const membership = await getActiveMembership(user.id);
  if (membership) {
    redirect("/dashboard");
  }

  return (
    <AuthCard>
      <CardEyebrow>Verger</CardEyebrow>
      <CardTitle>Set up your church</CardTitle>
      <CardSubtitle>
        You&apos;ll be the first admin — invite your team once this is created.
      </CardSubtitle>
      <CreateChurchForm />
    </AuthCard>
  );
}
