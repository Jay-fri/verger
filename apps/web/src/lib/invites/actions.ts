"use server";

import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CHURCH_ROLES, type ChurchRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { churchInvites, churchMembers, profiles } from "@/lib/db/schema";
import { requireActiveMembership } from "@/lib/auth/membership";
import { requireVerifiedUser } from "@/lib/auth/session";
import { getSiteUrl } from "@/lib/site-url";

const ROLE_SET = new Set<string>(CHURCH_ROLES);

export type InviteMemberState = { error: string | null; inviteUrl: string | null };

export async function inviteMemberAction(
  _prevState: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const { user, membership } = await requireActiveMembership();

  if (membership.role !== "admin") {
    return { error: "Only admins can invite team members.", inviteUrl: null };
  }
  if (!db) {
    return { error: "Database is not configured.", inviteUrl: null };
  }

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "");

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address.", inviteUrl: null };
  }
  if (!ROLE_SET.has(role)) {
    return { error: "Choose a role.", inviteUrl: null };
  }

  const matchingProfile = await db.query.profiles.findFirst({ where: eq(profiles.email, email) });
  if (matchingProfile) {
    const alreadyMember = await db.query.churchMembers.findFirst({
      where: and(
        eq(churchMembers.churchId, membership.church.id),
        eq(churchMembers.userId, matchingProfile.id),
      ),
    });
    if (alreadyMember) {
      return { error: "This person is already a member of your church.", inviteUrl: null };
    }
  }

  // Re-inviting refreshes the link rather than piling up duplicate pending
  // invites for the same email.
  await db
    .update(churchInvites)
    .set({ status: "revoked" })
    .where(
      and(
        eq(churchInvites.churchId, membership.church.id),
        eq(churchInvites.email, email),
        eq(churchInvites.status, "pending"),
      ),
    );

  const token = crypto.randomBytes(24).toString("base64url");

  await db.insert(churchInvites).values({
    churchId: membership.church.id,
    email,
    role: role as ChurchRole,
    token,
    invitedBy: user.id,
  });

  const inviteUrl = `${getSiteUrl()}/invite/${token}`;

  // TODO: send this via an actual email provider (Resend/Postmark/etc.) once
  // outbound email is wired up. Logged here so it's easy to grab locally —
  // it's also returned below so the settings page can show/copy it directly.
  console.log(`[invite] ${email} invited to "${membership.church.name}" as ${role}: ${inviteUrl}`);

  return { error: null, inviteUrl };
}

export type AcceptInviteState = { error: string | null };

export async function acceptInviteAction(
  _prevState: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    return { error: "Missing invite token." };
  }

  const user = await requireVerifiedUser(`/invite/${token}`);

  if (!db) {
    return { error: "Database is not configured." };
  }

  const invite = await db.query.churchInvites.findFirst({
    where: eq(churchInvites.token, token),
  });

  if (!invite || invite.status !== "pending") {
    return { error: "This invite is no longer valid." };
  }
  if (invite.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: `This invite was sent to ${invite.email}, not ${user.email}.` };
  }

  try {
    await db.insert(churchMembers).values({
      churchId: invite.churchId,
      userId: user.id,
      role: invite.role,
    });
  } catch (err) {
    const isUniqueViolation =
      typeof err === "object" && err !== null && (err as { code?: string }).code === "23505";
    if (!isUniqueViolation) throw err;
    // Already a member (e.g. double-submit) — fall through to marking the
    // invite accepted rather than surfacing a raw DB error.
  }

  await db
    .update(churchInvites)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(churchInvites.id, invite.id));

  redirect("/dashboard");
}
