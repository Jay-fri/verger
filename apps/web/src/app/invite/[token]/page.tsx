import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { churchInvites } from "@/lib/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/lib/auth/actions";
import {
  AuthCard,
  CardEyebrow,
  CardTitle,
  CardSubtitle,
  InfoMessage,
  SubmitButton,
  RoleBadge,
} from "@/components/ui";
import { AcceptInviteForm } from "./accept-invite-form";

// Invite status and the current session both change over time — never
// statically prerender this per-token page.
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!db) {
    return (
      <AuthCard>
        <CardEyebrow>Verger</CardEyebrow>
        <CardTitle>Invite unavailable</CardTitle>
        <CardSubtitle>Database is not configured.</CardSubtitle>
      </AuthCard>
    );
  }

  const invite = await db.query.churchInvites.findFirst({
    where: eq(churchInvites.token, token),
    with: { church: true },
  });

  if (!invite) {
    return (
      <AuthCard>
        <CardEyebrow>Verger</CardEyebrow>
        <CardTitle>Invite not found</CardTitle>
        <CardSubtitle>This invite link doesn&apos;t exist. Ask for a fresh one.</CardSubtitle>
      </AuthCard>
    );
  }

  if (invite.status === "accepted") {
    return (
      <AuthCard>
        <CardEyebrow>Verger</CardEyebrow>
        <CardTitle>Already used</CardTitle>
        <CardSubtitle>This invite has already been accepted.</CardSubtitle>
        <Link
          href="/sign-in"
          className="mt-6 block text-center text-sm text-accent-gold underline"
        >
          Sign in
        </Link>
      </AuthCard>
    );
  }

  if (invite.status === "revoked") {
    return (
      <AuthCard>
        <CardEyebrow>Verger</CardEyebrow>
        <CardTitle>Invite no longer active</CardTitle>
        <CardSubtitle>Ask an admin at {invite.church.name} for a new invite.</CardSubtitle>
      </AuthCard>
    );
  }

  const user = await getCurrentUser();
  const nextPath = `/invite/${token}`;
  const emailMatches = user != null && user.email.toLowerCase() === invite.email.toLowerCase();

  return (
    <AuthCard>
      <CardEyebrow>Verger</CardEyebrow>
      <CardTitle>Join {invite.church.name}</CardTitle>
      <CardSubtitle>
        You&apos;ve been invited as <RoleBadge role={invite.role} />
      </CardSubtitle>

      {!user && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link
            href={`/sign-up?next=${encodeURIComponent(nextPath)}`}
            className="rounded-lg bg-accent-gold px-4 py-2 text-center text-sm font-medium text-background hover:opacity-90"
          >
            Sign up
          </Link>
          <Link
            href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
            className="rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-text-primary hover:bg-background"
          >
            Sign in
          </Link>
        </div>
      )}

      {user && !emailMatches && (
        <div className="mt-6 space-y-3">
          <InfoMessage>
            This invite was sent to {invite.email}, but you&apos;re signed in as {user.email}.
          </InfoMessage>
          <form action={signOutAction}>
            <SubmitButton variant="secondary">Sign out</SubmitButton>
          </form>
        </div>
      )}

      {user && emailMatches && <AcceptInviteForm token={token} />}
    </AuthCard>
  );
}
