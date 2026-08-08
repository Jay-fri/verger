import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { cueItems, services, songs } from "@/lib/db/schema";
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

  const [outline, librarySongs] = await Promise.all([
    db.query.cueItems.findMany({
      where: eq(cueItems.serviceId, serviceId),
      orderBy: [asc(cueItems.position)],
    }),
    // For the Control console's quick-insert panel — every operator
    // (not just operator/admin roles, unlike Prep) can push a song section
    // live ad hoc, so this loads regardless of membership.role.
    db.query.songs.findMany({
      where: eq(songs.churchId, membership.church.id),
      with: { sections: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
      orderBy: [asc(songs.createdAt)],
    }),
  ]);

  return (
    <ControlConsole
      service={service}
      cueItems={outline}
      librarySongs={librarySongs}
      role={membership.role}
    />
  );
}
