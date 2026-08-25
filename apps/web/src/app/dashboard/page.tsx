import Link from "next/link";
import { and, desc, eq, ne } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { IconArrowRight, IconCalendarEvent, IconUsers, IconHistory } from "@tabler/icons-react";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { churchMembers, cueItems, services } from "@/lib/db/schema";
import { computeServiceState, type ServiceHomeState } from "@/lib/services/service-state";
import { StartPrepButton } from "./start-prep-button";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { weekday: "long", month: "long", day: "numeric" };

const HERO_COPY: Record<ServiceHomeState, { eyebrow: string; cta: string; href: (id: string) => string }> = {
  "not-started": { eyebrow: "Not started", cta: "Start prep", href: () => "" },
  "in-prep": { eyebrow: "In prep", cta: "Continue prep", href: (id) => `/service/${id}?mode=prep` },
  ready: { eyebrow: "Ready", cta: "Go live", href: (id) => `/service/${id}?mode=live` },
  live: { eyebrow: "Live now", cta: "Return to console", href: (id) => `/service/${id}?mode=live` },
};

export default async function DashboardHomePage() {
  const { membership } = await requireActiveMembership();

  if (!db) {
    return <p className="text-sm text-text-secondary">Database is not configured.</p>;
  }

  const [currentService, previousService, memberCount] = await Promise.all([
    db.query.services.findFirst({
      where: and(eq(services.churchId, membership.church.id), ne(services.status, "ended")),
      orderBy: [desc(services.scheduledFor)],
    }),
    db.query.services.findFirst({
      where: and(eq(services.churchId, membership.church.id), eq(services.status, "ended")),
      orderBy: [desc(services.scheduledFor)],
    }),
    db.query.churchMembers
      .findMany({ where: eq(churchMembers.churchId, membership.church.id) })
      .then((rows) => rows.length),
  ]);

  const cueItemCount = currentService
    ? (await db.query.cueItems.findMany({ where: eq(cueItems.serviceId, currentService.id) })).length
    : 0;

  const state = computeServiceState(
    currentService
      ? {
          status: currentService.status,
          scheduledFor: currentService.scheduledFor,
          cueItemCount,
          hasTranslation: true, // church.defaultTranslation always has a real value today — see computeServiceState's doc comment
        }
      : null,
  );
  const copy = HERO_COPY[state];

  return (
    <div className="space-y-6">
      {/* Hero — the one thing this screen is for: get back to this week's service in as close to one click as possible. */}
      <section className="border-border bg-surface rounded-2xl border p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <p className="text-accent-gold text-xs font-semibold tracking-wide uppercase">
              {state === "live" && (
                <span className="bg-accent-gold mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full align-middle" />
              )}
              {copy.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-semibold text-text-primary">
              {currentService ? currentService.title : "This week"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-text-secondary">
              <span className="flex items-center gap-1.5">
                <IconCalendarEvent size={16} stroke={1.75} aria-hidden="true" />
                {currentService
                  ? currentService.scheduledFor.toLocaleDateString("en-US", DATE_FORMAT)
                  : "No service scheduled yet"}
              </span>
              {currentService && (
                <span>
                  {cueItemCount === 0
                    ? "Outline is empty"
                    : `${cueItemCount} item${cueItemCount === 1 ? "" : "s"} in the outline`}
                </span>
              )}
            </div>
          </div>

          {currentService ? (
            <Link
              href={copy.href(currentService.id)}
              className="bg-accent-gold text-accent-gold-ink flex shrink-0 items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold hover:opacity-90"
            >
              {copy.cta}
              <IconArrowRight size={16} stroke={2} aria-hidden="true" />
            </Link>
          ) : hasRequiredRole(membership.role, ["operator", "admin"]) ? (
            <StartPrepButton />
          ) : (
            <p className="text-sm text-text-secondary">Ask an operator to start prep.</p>
          )}
        </div>
      </section>

      {/* Secondary — clearly subordinate to the hero: smaller type, no accent color, half-width on larger screens. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="border-border bg-surface rounded-xl border p-5">
          <div className="flex items-center gap-2 text-text-secondary">
            <IconHistory size={16} stroke={1.75} aria-hidden="true" />
            <p className="text-xs font-medium tracking-wide uppercase">Previous service</p>
          </div>
          {previousService ? (
            <>
              <p className="mt-2 text-sm font-medium text-text-primary">{previousService.title}</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {previousService.scheduledFor.toLocaleDateString("en-US", DATE_FORMAT)}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-text-secondary">No past services yet.</p>
          )}
        </div>

        <div className="border-border bg-surface rounded-xl border p-5">
          <div className="flex items-center gap-2 text-text-secondary">
            <IconUsers size={16} stroke={1.75} aria-hidden="true" />
            <p className="text-xs font-medium tracking-wide uppercase">Team</p>
          </div>
          <p className="mt-2 text-sm font-medium text-text-primary">
            {memberCount} member{memberCount === 1 ? "" : "s"}
          </p>
          <Link href="/dashboard/settings" className="text-accent-gold mt-0.5 inline-block text-xs hover:underline">
            Manage in Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
