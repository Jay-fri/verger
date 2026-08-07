import Link from "next/link";
import { AuthCard, CardEyebrow, CardTitle, CardSubtitle } from "@/components/ui";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const signUpHref = next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up";

  return (
    <AuthCard>
      <CardEyebrow>Verger</CardEyebrow>
      <CardTitle>Sign in</CardTitle>
      <CardSubtitle>Welcome back.</CardSubtitle>

      <SignInForm next={next} initialError={error} />

      <p className="mt-6 text-center text-sm text-text-secondary">
        Need an account?{" "}
        <Link href={signUpHref} className="text-accent-gold underline">
          Sign up
        </Link>
      </p>
    </AuthCard>
  );
}
