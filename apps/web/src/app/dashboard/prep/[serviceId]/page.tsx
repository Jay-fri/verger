import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { cueItems, services } from "@/lib/db/schema";
import { OutlineEditor } from "./outline-editor";

export const dynamic = "force-dynamic";

export default async function ServiceOutlinePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const { membership } = await requireActiveMembership();

  if (!hasRequiredRole(membership.role, ["operator", "admin"])) {
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

  if (!db) {
    notFound();
  }

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  // Not found, or belongs to a different church — same response either way
  // so a URL guess can't distinguish "doesn't exist" from "not yours".
  if (!service || service.churchId !== membership.church.id) {
    notFound();
  }

  const outline = await db.query.cueItems.findMany({
    where: eq(cueItems.serviceId, serviceId),
    orderBy: [asc(cueItems.position)],
  });

  return <OutlineEditor service={service} initialCueItems={outline} />;
}
