import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { liveState } from "@/lib/db/schema";
import type { CueItemType } from "./types";

export type LiveStateMode = "content" | "clear" | "black" | "logo";

export type LiveStateInput = {
  source: "cue" | "detection" | "search" | "quick";
  type: CueItemType;
  label: string;
  text: string;
  // Optional on purpose — setLiveStateAction only touches the columns
  // actually present on this object (see its own doc comment), so a caller
  // that isn't changing the order-of-service "next" pointer (quick-insert,
  // manual search, an AI match) simply omits nextLabel/nextText/nextType
  // and leaves whatever the monitor is currently showing untouched. mode
  // defaults to "content" server-side but pushLive always sends it
  // explicitly (see control-console.tsx) so a normal content push reliably
  // clears any earlier Clear/Black/Logo panic-button state.
  mode?: LiveStateMode;
  nextLabel?: string | null;
  nextText?: string | null;
  nextType?: CueItemType | null;
};

// The full row, including fields the audience Stage output deliberately
// never reads (operatorMessage, next*) but the Stage confidence monitor
// does — both public routes share this one read + one Realtime channel
// rather than each standing up their own.
export type LiveStateRow = {
  source: "cue" | "detection" | "search" | "quick";
  type: CueItemType;
  label: string;
  text: string;
  mode: LiveStateMode;
  nextLabel: string | null;
  nextText: string | null;
  nextType: CueItemType | null;
  operatorMessage: string | null;
};

/**
 * Plain (non-Server-Action) read for the Stage output/monitor routes'
 * initial render — deliberately does NOT call requireServiceAccess: both
 * are public pages (see proxy.ts's PUBLIC_PATHS), so this has no session to
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
export async function getLiveState(serviceId: string): Promise<LiveStateRow | null> {
  if (!db) return null;
  const row = await db.query.liveState.findFirst({ where: eq(liveState.serviceId, serviceId) });
  if (!row) return null;
  return {
    source: row.source,
    type: row.type,
    label: row.label,
    text: row.text,
    mode: row.mode,
    nextLabel: row.nextLabel,
    nextText: row.nextText,
    nextType: row.nextType,
    operatorMessage: row.operatorMessage,
  };
}
