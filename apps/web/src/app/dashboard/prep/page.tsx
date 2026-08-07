import { hasRequiredRole } from "@verger/shared-types";
import { requireActiveMembership } from "@/lib/auth/membership";

// Demonstrates real role-gated route protection: requireActiveMembership()
// already rejects logged-out users (-> /sign-in) and users with no church
// (-> /onboarding). The role check below additionally rejects volunteers —
// the content past this check never renders for them, this isn't a
// client-side hide.
export default async function PrepPage() {
  const { membership } = await requireActiveMembership();
  const allowed = hasRequiredRole(membership.role, ["operator", "admin"]);

  if (!allowed) {
    return (
      <div className="border-live/40 bg-live/10 rounded-xl border p-6">
        <h1 className="text-live text-lg font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-text-primary">
          Prep requires the operator or admin role. You&apos;re signed in as{" "}
          <strong>{membership.role}</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h1 className="text-lg font-semibold text-text-primary">Prep</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Building the service outline and verse/song cue list comes in a later build phase.
      </p>
    </div>
  );
}
