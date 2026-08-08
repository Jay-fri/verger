import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { liveState } from "@/lib/db/schema";
import type { CueItemType } from "./types";

export type LiveStateInput = {
  source: "cue" | "detection" | "search" | "quick";
  type: CueItemType;
  label: string;
  text: string;
};

/**
 * Plain (non-Server-Action) read for the Stage output route's initial
 * render — deliberately does NOT call requireServiceAccess: Stage output is
 * a public page (see proxy.ts's PUBLIC_PATHS), so this has no session to
 * check. Access control for this data is "you know the service ID," same
 * as the Realtime subscription's RLS policy.
 *
 * Kept in its own file (not alongside setLiveStateAction) on purpose: this
 * module pulls in the Drizzle/`postgres` client, and mixing a plain
 * function with an inline "use server" one in a file that a Client
 * Component also imports from confused Next.js's bundler into pulling the
 * whole DB client (and its Node-only deps like `tls`) into the browser
 * bundle. A top-of-file "use server" (see live-state-action.ts) is the
 * reliable way to keep server code out of the client build.
 */
export async function getLiveState(serviceId: string): Promise<LiveStateInput | null> {
  if (!db) return null;
  const row = await db.query.liveState.findFirst({ where: eq(liveState.serviceId, serviceId) });
  if (!row) return null;
  return { source: row.source, type: row.type, label: row.label, text: row.text };
}
