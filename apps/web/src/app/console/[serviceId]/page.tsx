import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { cueItems, services } from "@/lib/db/schema";
import { ControlConsole } from "./control-console";

export const dynamic = "force-dynamic";

export default async function ConsolePage({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  const { membership } = await requireActiveMembership();

  if (!db) {
    notFound();
  }

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service || service.churchId !== membership.church.id) {
    notFound();
  }

  const outline = await db.query.cueItems.findMany({
    where: eq(cueItems.serviceId, serviceId),
    orderBy: [asc(cueItems.position)],
  });

  return <ControlConsole service={service} cueItems={outline} role={membership.role} />;
}
