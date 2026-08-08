"use server";

import { db } from "@/lib/db";
import { liveState } from "@/lib/db/schema";
import { requireServiceAccess } from "./access";
import type { LiveStateInput, LiveStateMode } from "./live-state";

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

// Insert-branch defaults for the two mode/message-only actions below — only
// ever used the very first time a service's live_state row is created by a
// panic-button click or operator message *before* anything has ever been
// pushed live through setLiveStateAction. The update branch (the overwhelmingly
// common case) touches only the one column each action cares about, leaving
// content/next/the other of the two alone — see each action's own comment.
const EMPTY_CONTENT_DEFAULTS = { source: "quick", type: "custom_text", label: "", text: "" } as const;

/**
 * Clear/Black/Logo — the panic buttons. Deliberately touches ONLY `mode`,
 * never the content columns (label/text/source/type) or the next-cue
 * columns: per the feature spec, Clear is "blank the text but keep any
 * background," which in this data model means "don't overwrite the
 * underlying row at all, just change how the Stage output renders it."
 * Called directly from control-console.tsx's panic-button handlers, never
 * through pushLive — these bypass the minimum-display-time debounce
 * entirely, an emergency override rather than a normal content change.
 */
export async function setLiveStateModeAction(serviceId: string, mode: LiveStateMode): Promise<void> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  await db
    .insert(liveState)
    .values({ serviceId, ...EMPTY_CONTENT_DEFAULTS, mode, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: liveState.serviceId,
      set: { mode, updatedAt: new Date() },
    });
}

/**
 * The operator → stage-monitor message (see the Control console's message
 * field). Visible only on the Stage confidence monitor, never the audience
 * Stage output — see monitor/[serviceId]'s page component, which reads this
 * column, versus stage/[serviceId], which doesn't. No history: this simply
 * replaces whatever message was there before. Pass null to clear it.
 */
export async function setOperatorMessageAction(
  serviceId: string,
  operatorMessage: string | null,
): Promise<void> {
  await requireServiceAccess(serviceId);
  if (!db) throw new Error("Database is not configured.");

  await db
    .insert(liveState)
    .values({ serviceId, ...EMPTY_CONTENT_DEFAULTS, operatorMessage, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: liveState.serviceId,
      set: { operatorMessage, updatedAt: new Date() },
    });
}
