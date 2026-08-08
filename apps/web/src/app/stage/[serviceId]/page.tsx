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
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;

  if (!db) {
    notFound();
  }

  const service = await db.query.services.findFirst({ where: eq(services.id, serviceId) });
  if (!service) {
    notFound();
  }

  const initialLiveItem = await getLiveState(serviceId);

  return <StageDisplay serviceId={serviceId} initialLiveItem={initialLiveItem} />;
}
