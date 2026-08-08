import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { services } from "@/lib/db/schema";
import { getLiveState } from "@/lib/services/live-state";
import { MonitorDisplay } from "./monitor-display";

// A live value that changes whenever the Control console pushes something —
// this can never be statically cached.
export const dynamic = "force-dynamic";

// Deliberately public — no requireActiveMembership() here, same trust model
// as the audience Stage output (see src/app/stage/[serviceId]/page.tsx):
// this is meant to run unattended on a screen facing the pastor/band, with
// no one there to log in. See proxy.ts's PUBLIC_PATHS and
// drizzle/0008_live_state_realtime_and_rls.sql.
export default async function MonitorPage({
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

  const initialLiveState = await getLiveState(serviceId);

  return <MonitorDisplay serviceId={serviceId} initialLiveState={initialLiveState} />;
}
