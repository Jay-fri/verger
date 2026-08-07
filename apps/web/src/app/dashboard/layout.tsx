import Link from "next/link";
import type { ReactNode } from "react";
import { requireActiveMembership } from "@/lib/auth/membership";
import { signOutAction } from "@/lib/auth/actions";
import { RoleBadge } from "@/components/ui";

// Every page under /dashboard depends on the request's session cookie —
// never statically prerender or cache this subtree.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireActiveMembership();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-accent-gold uppercase">Verger</p>
            <p className="text-lg font-semibold text-text-primary">{membership.church.name}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-text-secondary hover:text-text-primary">
              Dashboard
            </Link>
            <Link href="/dashboard/prep" className="text-text-secondary hover:text-text-primary">
              Prep
            </Link>
            <Link
              href="/dashboard/settings"
              className="text-text-secondary hover:text-text-primary"
            >
              Settings
            </Link>
            <RoleBadge role={membership.role} />
            <span className="text-text-secondary">{user.email}</span>
            <form action={signOutAction}>
              <button type="submit" className="text-text-secondary hover:text-live">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
