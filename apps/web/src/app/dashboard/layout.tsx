import Link from "next/link";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { TopNav, UserMenu } from "./top-nav";

// Every page under /dashboard depends on the request's session cookie —
// never statically prerender or cache this subtree.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireActiveMembership();

  const profile = db
    ? await db.query.profiles.findFirst({ where: eq(profiles.id, user.id) })
    : undefined;
  const displayName = profile?.fullName || user.email;

  return (
    <div className="min-h-screen">
      <header className="border-border bg-surface border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="shrink-0">
              <p className="text-accent-gold text-sm font-semibold tracking-wide">Verger</p>
              <p className="max-w-45 truncate text-xs text-text-secondary">{membership.church.name}</p>
            </Link>
            <TopNav />
          </div>
          <UserMenu name={displayName} email={user.email} role={membership.role} />
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
