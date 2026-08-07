"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gt, lt } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { announcementSlides, cueItems, customTexts, services, songSections } from "@/lib/db/schema";
import { requireActiveMembership, type ActiveMembership } from "@/lib/auth/membership";
import type { CurrentUser } from "@/lib/auth/session";
import type { VerseSearchResult } from "./search";
import type { CueItemType } from "./types";

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

type NewCueContent =
  | { type: "verse"; label: string; text: string; translation: string; book: string; chapter: number; verse: number }
  | { type: Exclude<CueItemType, "verse">; label: string; text: string };

async function insertCueItem(serviceId: string, content: NewCueContent): Promise<void> {
  if (!db) throw new Error("Database is not configured.");

  const existing = await db
    .select({ position: cueItems.position })
    .from(cueItems)
    .where(eq(cueItems.serviceId, serviceId));
  const nextPosition = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  await db.insert(cueItems).values({
    serviceId,
    position: nextPosition,
    type: content.type,
    label: content.label,
    text: content.text,
    translation: content.type === "verse" ? content.translation : null,
    book: content.type === "verse" ? content.book : null,
    chapter: content.type === "verse" ? content.chapter : null,
    verse: content.type === "verse" ? content.verse : null,
  });

  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function addCueItemAction(serviceId: string, verse: VerseSearchResult): Promise<void> {
  await requirePrepAccess();
  await insertCueItem(serviceId, { type: "verse", ...verse });
}

export async function addSongSectionCueAction(serviceId: string, songSectionId: string): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const section = await db.query.songSections.findFirst({
    where: eq(songSections.id, songSectionId),
    with: { song: true },
  });
  if (!section || section.song.churchId !== membership.church.id) {
    throw new Error("Song section not found.");
  }

  await insertCueItem(serviceId, {
    type: "song_section",
    label: `${section.song.title} — ${section.label}`,
    text: section.lyrics,
  });
}

export async function addAnnouncementSlideCueAction(
  serviceId: string,
  slideId: string,
): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const slide = await db.query.announcementSlides.findFirst({
    where: eq(announcementSlides.id, slideId),
    with: { announcement: true },
  });
  if (!slide || slide.announcement.churchId !== membership.church.id) {
    throw new Error("Announcement slide not found.");
  }

  await insertCueItem(serviceId, {
    type: "announcement_slide",
    label: slide.announcement.title,
    text: slide.text,
  });
}

export async function addCustomTextCueAction(serviceId: string, customTextId: string): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const item = await db.query.customTexts.findFirst({ where: eq(customTexts.id, customTextId) });
  if (!item || item.churchId !== membership.church.id) {
    throw new Error("Custom text not found.");
  }

  await insertCueItem(serviceId, { type: "custom_text", label: item.title, text: item.text });
}

// Custom text is meant for one-off use ("type it once, put it on screen" —
// see the library README/schema comment), so this creates the library
// entry (for potential reuse later) *and* cues it into this service in one
// step, rather than requiring a trip to the Library page first.
export async function createAndAddCustomTextCueAction(
  serviceId: string,
  title: string,
  text: string,
): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const trimmedTitle = title.trim();
  const trimmedText = text.trim();
  if (!trimmedTitle || !trimmedText) {
    throw new Error("Title and text are required.");
  }

  await db.insert(customTexts).values({
    churchId: membership.church.id,
    title: trimmedTitle,
    text: trimmedText,
  });

  await insertCueItem(serviceId, { type: "custom_text", label: trimmedTitle, text: trimmedText });
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
