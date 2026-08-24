import { and, eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { churchInvites, churchMembers } from "@/lib/db/schema";
import { RoleBadge } from "@/components/ui";
import { InviteMemberForm } from "./invite-member-form";
import { LogoUploadForm } from "./logo-upload-form";
import { TranslationForm } from "./translation-form";

export default async function SettingsPage() {
  const { membership } = await requireActiveMembership();
  const isAdmin = membership.role === "admin";

  const members = db
    ? await db.query.churchMembers.findMany({
        where: eq(churchMembers.churchId, membership.church.id),
        with: { profile: true },
        orderBy: (fields, { asc }) => [asc(fields.createdAt)],
      })
    : [];

  const pendingInvites =
    db && isAdmin
      ? await db.query.churchInvites.findMany({
          where: and(
            eq(churchInvites.churchId, membership.church.id),
            eq(churchInvites.status, "pending"),
          ),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
        })
      : [];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-text-primary">Settings</h1>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Church</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-secondary">Name</dt>
            <dd className="text-text-primary">{membership.church.name}</dd>
          </div>
          {!isAdmin && (
            <div className="flex justify-between">
              <dt className="text-text-secondary">Default translation</dt>
              <dd className="text-text-primary">{membership.church.defaultTranslation}</dd>
            </div>
          )}
        </dl>

        {isAdmin ? (
          <div className="mt-6 border-t border-border pt-4">
            <TranslationForm currentTranslation={membership.church.defaultTranslation} />
            <p className="mt-2 text-xs text-text-secondary">
              What new Control console sessions start on — every session can still switch translation
              live from there. Only the four public-domain translations above are ingested; a licensed
              translation (NIV, ESV, etc.) needs its own publisher clearance before it could be added.
            </p>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="mt-6 border-t border-border pt-4">
            <h3 className="text-xs font-medium text-text-secondary uppercase">Logo</h3>
            <div className="mt-2">
              <LogoUploadForm currentLogoDataUrl={membership.church.logoDataUrl} />
            </div>
          </div>
        ) : (
          membership.church.logoDataUrl && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-xs font-medium text-text-secondary uppercase">Logo</h3>
              {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL, not a remote asset */}
              <img
                src={membership.church.logoDataUrl}
                alt="Church logo"
                className="mt-2 h-16 w-16 rounded-lg border border-border object-contain"
              />
            </div>
          )
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
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
      </section>

      {isAdmin ? (
        <section className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
            Invite a team member
          </h2>
          <InviteMemberForm />

          {pendingInvites.length > 0 && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="text-xs font-medium text-text-secondary uppercase">
                Pending invites
              </h3>
              <ul className="mt-2 space-y-2">
                {pendingInvites.map((invite) => (
                  <li key={invite.id} className="flex items-center justify-between text-sm">
                    <span className="text-text-primary">{invite.email}</span>
                    <RoleBadge role={invite.role} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      ) : (
        <p className="text-sm text-text-secondary">Only admins can invite team members.</p>
      )}
    </div>
  );
}
