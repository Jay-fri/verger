"use server";

import { db } from "@/lib/db";
import { liveState } from "@/lib/db/schema";
import { requireServiceAccess } from "./access";
import type { LiveStateInput } from "./live-state";

/**
 * Persists whatever the Control console just pushed live. This single write
 * *is* the "publish" step — there's no separate broadcast call. Postgres
 * Changes (see drizzle/0008_live_state_realtime_and_rls.sql) notices this
 * UPDATE/INSERT and pushes it to every subscribed Stage output tab
 * automatically.
 */
export async function setLiveStateAction(serviceId: string, item: LiveStateInput): Promise<void> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  await db
    .insert(liveState)
    .values({ serviceId, ...item, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: liveState.serviceId,
      set: { ...item, updatedAt: new Date() },
    });
}
