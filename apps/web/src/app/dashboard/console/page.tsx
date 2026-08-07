import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";

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

// No role gate here — unlike Prep, every role (including volunteer) can
// view/run the Control console, per the overview doc's role table.
export default async function ConsolePicker() {
  const { membership } = await requireActiveMembership();

  const churchServices = db
    ? await db.query.services.findMany({
        where: eq(services.churchId, membership.church.id),
        orderBy: [desc(services.createdAt)],
      })
    : [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Control console</h1>
        <p className="mt-1 text-sm text-text-secondary">Pick a service to run.</p>
      </div>

      <section className="rounded-xl border border-border bg-surface p-6">
        {churchServices.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No services yet.{" "}
            <Link href="/dashboard/prep" className="text-accent-gold underline">
              Build one in Prep
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {churchServices.map((service) => (
              <li key={service.id} className="flex items-center justify-between py-3">
                <Link
                  href={`/console/${service.id}`}
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
