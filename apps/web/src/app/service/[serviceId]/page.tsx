import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { requireActiveMembership } from "@/lib/auth/membership";
import { db } from "@/lib/db";
import { announcements, cueItems, customTexts, services, songs } from "@/lib/db/schema";
import { ServiceScreen } from "./service-screen";

export const dynamic = "force-dynamic";

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { serviceId } = await params;
  const { mode: requestedMode } = await searchParams;
  const { membership } = await requireActiveMembership();

  if (!db) {
    notFound();
  }

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  // Not found, or belongs to a different church — same response either way
  // so a URL guess can't distinguish "doesn't exist" from "not yours".
  if (!service || service.churchId !== membership.church.id) {
    notFound();
  }

  const [outline, librarySongs, libraryAnnouncements, libraryCustomTexts] = await Promise.all([
    db.query.cueItems.findMany({
      where: eq(cueItems.serviceId, serviceId),
      orderBy: [asc(cueItems.position)],
    }),
    db.query.songs.findMany({
      where: eq(songs.churchId, membership.church.id),
      with: { sections: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
      orderBy: [asc(songs.createdAt)],
    }),
    db.query.announcements.findMany({
      where: eq(announcements.churchId, membership.church.id),
      with: { slides: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
      orderBy: [asc(announcements.createdAt)],
    }),
    db.query.customTexts.findMany({
      where: eq(customTexts.churchId, membership.church.id),
      orderBy: [asc(customTexts.createdAt)],
    }),
  ]);

  const initialMode = requestedMode === "live" || requestedMode === "prep" ? requestedMode : service.status === "live" ? "live" : "prep";

  return (
    <ServiceScreen
      service={service}
      initialCueItems={outline}
      librarySongs={librarySongs}
      libraryAnnouncements={libraryAnnouncements}
      libraryCustomTexts={libraryCustomTexts}
      role={membership.role}
      editable={hasRequiredRole(membership.role, ["operator", "admin"])}
      defaultTranslation={membership.church.defaultTranslation}
      initialMode={initialMode}
    />
  );
}
