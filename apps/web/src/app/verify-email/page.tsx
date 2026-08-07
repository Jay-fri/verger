import { AuthCard, CardEyebrow, CardTitle, CardSubtitle } from "@/components/ui";
import { ResendForm } from "./resend-form";

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <AuthCard>
      <CardEyebrow>Verger</CardEyebrow>
      <CardTitle>Check your email</CardTitle>
      <CardSubtitle>
        {email ? `We sent a confirmation link to ${email}.` : "We sent you a confirmation link."}{" "}
        Click it to finish setting up your account.
      </CardSubtitle>

      {email && <ResendForm email={email} />}
    </AuthCard>
  );
}
