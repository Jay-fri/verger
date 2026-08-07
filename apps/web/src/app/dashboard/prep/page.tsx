import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { NewServiceForm } from "./new-service-form";

// Depends on the request's session cookie — never statically prerender.
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  live: "Live",
  ended: "Ended",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-text-secondary/15 text-text-secondary",
  live: "bg-live/15 text-live",
  ended: "bg-text-secondary/15 text-text-secondary",
};

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

  const churchServices = db
    ? await db.query.services.findMany({
        where: eq(services.churchId, membership.church.id),
        orderBy: [desc(services.createdAt)],
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Prep</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Build a service outline ahead of time — the verses you plan to reference give the live
          detection engine an outline to check against first.
        </p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">
          New service
        </h2>
        <NewServiceForm />
      </section>

      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-sm font-medium tracking-wide text-accent-gold uppercase">Services</h2>
        {churchServices.length === 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            No services yet — create one above to start building an outline.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border">
            {churchServices.map((service) => (
              <li key={service.id} className="flex items-center justify-between py-3">
                <Link
                  href={`/dashboard/prep/${service.id}`}
                  className="text-sm font-medium text-text-primary hover:text-accent-gold"
                >
                  {service.title}
                </Link>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[service.status]}`}
                >
                  {STATUS_LABEL[service.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
