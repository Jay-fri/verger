import Link from "next/link";
import { AuthCard, CardEyebrow, CardTitle, CardSubtitle } from "@/components/ui";
import { SignUpForm } from "./sign-up-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const signInHref = next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in";

  return (
    <AuthCard>
      <CardEyebrow>Verger</CardEyebrow>
      <CardTitle>Create your account</CardTitle>
      <CardSubtitle>Set up media team access for your church.</CardSubtitle>

      <SignUpForm next={next} initialError={error} />

      <p className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href={signInHref} className="text-accent-gold underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
