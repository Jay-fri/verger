import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import type { ChurchRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { churchMembers } from "@/lib/db/schema";
import { requireUser, type CurrentUser } from "./session";

export type ActiveMembership = {
  church: {
    id: string;
    name: string;
    defaultTranslation: string;
  };
  role: ChurchRole;
};

// A user can in theory belong to more than one church (e.g. after accepting
// a second invite), but there's no church-switcher UI yet — this repo has no
// concept of an "active" church selection beyond "the first one you joined".
// Revisit when multi-church support is actually built.
export async function getActiveMembership(userId: string): Promise<ActiveMembership | null> {
  if (!db) {
    throw new Error("Database not configured — set DATABASE_URL in apps/web/.env.local.");
  }

  const membership = await db.query.churchMembers.findFirst({
    where: eq(churchMembers.userId, userId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
    with: { church: true },
  });

  if (!membership) return null;

  return {
    church: {
      id: membership.church.id,
      name: membership.church.name,
      defaultTranslation: membership.church.defaultTranslation,
    },
    role: membership.role,
  };
}

// Requires: logged in (-> /sign-in), and a church membership (-> /onboarding).
// Does NOT check role — callers that need a specific role check
// `membership.role` themselves and render their own "access denied" state,
// so the rejection is visible at the call site rather than hidden in a
// generic redirect. See src/app/dashboard/prep/page.tsx for the pattern.
export async function requireActiveMembership(): Promise<{
  user: CurrentUser;
  membership: ActiveMembership;
}> {
  const user = await requireUser();
  const membership = await getActiveMembership(user.id);

  if (!membership) {
    redirect("/onboarding");
  }

  return { user, membership };
}
