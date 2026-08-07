import { eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { churchMembers } from "@/lib/db/schema";
import { RoleBadge } from "@/components/ui";

export default async function DashboardPage() {
  const { membership } = await requireActiveMembership();

  const members = db
    ? await db.query.churchMembers.findMany({
        where: eq(churchMembers.churchId, membership.church.id),
        with: { profile: true },
        orderBy: (fields, { asc }) => [asc(fields.createdAt)],
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">{membership.church.name}</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Default translation: {membership.church.defaultTranslation}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Team</h2>
        <ul className="mt-4 divide-y divide-border">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {member.profile?.fullName || member.profile?.email}
                </p>
                <p className="text-xs text-text-secondary">{member.profile?.email}</p>
              </div>
              <RoleBadge role={member.role} />
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 text-sm text-text-secondary">
        Prep, the Control console, and live scripture detection land in later build phases — this
        dashboard is a placeholder.
      </div>
    </div>
  );
}
