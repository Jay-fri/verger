import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { getLiveState } from "@/lib/services/live-state";
import { StageDisplay } from "./stage-display";

// A live value that changes whenever the Control console pushes something —
// this can never be statically cached.
export const dynamic = "force-dynamic";

// Deliberately public — no requireActiveMembership() here. This is the page
// vMix's Browser Source points at, which can't carry a login session. See
// drizzle/0008_live_state_realtime_and_rls.sql for the corresponding RLS
// policy that makes the same "public if you know the service ID" call for
// the realtime subscription itself.
export default async function StagePage({
  params,
  searchParams,
}: {
  params: Promise<{ serviceId: string }>;
  searchParams: Promise<{ bg?: string }>;
}) {
  const { serviceId } = await params;
  const { bg } = await searchParams;

  if (!db) {
    notFound();
  }

  const service = await db.query.services.findFirst({
    where: eq(services.id, serviceId),
    with: { church: true },
  });
  if (!service) {
    notFound();
  }

  const initialLiveItem = await getLiveState(serviceId);

  return (
    <StageDisplay
      serviceId={serviceId}
      initialLiveItem={initialLiveItem}
      churchLogoDataUrl={service.church.logoDataUrl}
      // ?bg=transparent — the alpha/overlay-compositing path (desktop NDI
      // bridge, overlay mode) vs. the default opaque path (vMix Browser
      // Source as a full-screen graphic, or any plain browser view). Default
      // stays opaque so nothing about existing usage changes.
      transparent={bg === "transparent"}
    />
  );
}
