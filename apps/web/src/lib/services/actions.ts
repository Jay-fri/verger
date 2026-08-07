"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { cueItems, services } from "@/lib/db/schema";
import { requireActiveMembership, type ActiveMembership } from "@/lib/auth/membership";
import type { CurrentUser } from "@/lib/auth/session";
import type { VerseSearchResult } from "./search";

async function requirePrepAccess(): Promise<{ user: CurrentUser; membership: ActiveMembership }> {
  const { user, membership } = await requireActiveMembership();
  if (!hasRequiredRole(membership.role, ["operator", "admin"])) {
    throw new Error("Only operators and admins can edit Prep outlines.");
  }
  return { user, membership };
}

export type CreateServiceState = { error: string | null };

export async function createServiceAction(
  _prevState: CreateServiceState,
  formData: FormData,
): Promise<CreateServiceState> {
  const { user, membership } = await requirePrepAccess();
  const title = String(formData.get("title") ?? "").trim();

  if (!title) {
    return { error: "Give this service a title." };
  }
  if (!db) {
    return { error: "Database is not configured." };
  }

  const [service] = await db
    .insert(services)
    .values({ churchId: membership.church.id, title, createdBy: user.id })
    .returning();

  redirect(`/dashboard/prep/${service.id}`);
}

export async function addCueItemAction(serviceId: string, verse: VerseSearchResult): Promise<void> {
  await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const existing = await db
    .select({ position: cueItems.position })
    .from(cueItems)
    .where(eq(cueItems.serviceId, serviceId));
  const nextPosition = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  await db.insert(cueItems).values({
    serviceId,
    position: nextPosition,
    translation: verse.translation,
    book: verse.book,
    chapter: verse.chapter,
    verse: verse.verse,
    label: verse.label,
    text: verse.text,
  });

  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function removeCueItemAction(serviceId: string, cueItemId: string): Promise<void> {
  await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  await db.delete(cueItems).where(and(eq(cueItems.id, cueItemId), eq(cueItems.serviceId, serviceId)));
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function moveCueItemAction(
  serviceId: string,
  cueItemId: string,
  direction: "up" | "down",
): Promise<void> {
  await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const [current] = await db
    .select()
    .from(cueItems)
    .where(and(eq(cueItems.id, cueItemId), eq(cueItems.serviceId, serviceId)));
  if (!current) return;

  // "up" wants the closest earlier item (largest position < current);
  // "down" wants the closest later item (smallest position > current).
  const [neighbor] =
    direction === "up"
      ? await db
          .select()
          .from(cueItems)
          .where(and(eq(cueItems.serviceId, serviceId), lt(cueItems.position, current.position)))
          .orderBy(desc(cueItems.position))
          .limit(1)
      : await db
          .select()
          .from(cueItems)
          .where(and(eq(cueItems.serviceId, serviceId), gt(cueItems.position, current.position)))
          .orderBy(asc(cueItems.position))
          .limit(1);
  if (!neighbor) return;

  await db.update(cueItems).set({ position: neighbor.position }).where(eq(cueItems.id, current.id));
  await db.update(cueItems).set({ position: current.position }).where(eq(cueItems.id, neighbor.id));

  revalidatePath(`/dashboard/prep/${serviceId}`);
}
