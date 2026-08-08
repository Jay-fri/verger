"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { hasRequiredRole } from "@verger/shared-types";
import { db } from "@/lib/db";
import { announcementSlides, cueItems, customTexts, services, songSections, songs } from "@/lib/db/schema";
import { requireActiveMembership, type ActiveMembership } from "@/lib/auth/membership";
import type { CurrentUser } from "@/lib/auth/session";
import type { CueSection } from "./cue-sections";
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
  | { type: "song_section"; label: string; text: string; songSectionId: string }
  | { type: Exclude<CueItemType, "verse" | "song_section">; label: string; text: string };

async function insertCueItem(serviceId: string, section: CueSection, content: NewCueContent): Promise<void> {
  if (!db) throw new Error("Database is not configured.");

  const existing = await db
    .select({ position: cueItems.position })
    .from(cueItems)
    .where(eq(cueItems.serviceId, serviceId));
  const nextPosition = existing.reduce((max, row) => Math.max(max, row.position), -1) + 1;

  await db.insert(cueItems).values({
    serviceId,
    position: nextPosition,
    section,
    type: content.type,
    label: content.label,
    text: content.text,
    translation: content.type === "verse" ? content.translation : null,
    book: content.type === "verse" ? content.book : null,
    chapter: content.type === "verse" ? content.chapter : null,
    verse: content.type === "verse" ? content.verse : null,
    songSectionId: content.type === "song_section" ? content.songSectionId : null,
  });
}

// Keeps songs.lastArrangement in sync with whatever this song's sections
// are *currently* arranged as, in this one service — called after any add/
// remove/move that touches a song_section cue item. Always reflects the
// most recently touched service's current arrangement for this song (see
// the schema comment on songs.lastArrangement), not necessarily the most
// recently *created* one. Sets it back to null if this service no longer
// uses any of the song's sections at all (e.g. after removing the last one).
async function syncSongArrangement(serviceId: string, songId: string): Promise<void> {
  if (!db) return;

  const rows = await db
    .select({ songSectionId: cueItems.songSectionId, position: cueItems.position })
    .from(cueItems)
    .innerJoin(songSections, eq(cueItems.songSectionId, songSections.id))
    .where(and(eq(cueItems.serviceId, serviceId), eq(songSections.songId, songId)))
    .orderBy(asc(cueItems.position));

  const arrangement = rows
    .map((row) => row.songSectionId)
    .filter((id): id is string => id !== null);

  await db
    .update(songs)
    .set({ lastArrangement: arrangement.length > 0 ? arrangement : null })
    .where(eq(songs.id, songId));
}

export async function addCueItemAction(
  serviceId: string,
  section: CueSection,
  verse: VerseSearchResult,
): Promise<void> {
  await requirePrepAccess();
  await insertCueItem(serviceId, section, { type: "verse", ...verse });
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function addSongSectionCueAction(
  serviceId: string,
  section: CueSection,
  songSectionId: string,
): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const songSection = await db.query.songSections.findFirst({
    where: eq(songSections.id, songSectionId),
    with: { song: true },
  });
  if (!songSection || songSection.song.churchId !== membership.church.id) {
    throw new Error("Song section not found.");
  }

  await insertCueItem(serviceId, section, {
    type: "song_section",
    label: `${songSection.song.title} — ${songSection.label}`,
    text: songSection.lyrics,
    songSectionId: songSection.id,
  });
  await syncSongArrangement(serviceId, songSection.songId);
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

// Adds every section of a song in one step, in the order they were last
// arranged (songs.lastArrangement) — see cue-sections' doc comments and the
// "Reuse last arrangement" button in add-content-tabs.tsx. Falls back to
// the song's raw section order (position) if it has no saved arrangement
// yet (e.g. its first-ever use).
export async function addSongArrangementCueAction(
  serviceId: string,
  section: CueSection,
  songId: string,
): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const song = await db.query.songs.findFirst({
    where: eq(songs.id, songId),
    with: { sections: { orderBy: (fields, { asc: ord }) => [ord(fields.position)] } },
  });
  if (!song || song.churchId !== membership.church.id) {
    throw new Error("Song not found.");
  }

  const sectionsById = new Map(song.sections.map((s) => [s.id, s]));
  const orderedIds = song.lastArrangement?.length ? song.lastArrangement : song.sections.map((s) => s.id);

  for (const sectionId of orderedIds) {
    const songSection = sectionsById.get(sectionId);
    // A saved arrangement can reference a section that's since been deleted
    // from the library — skip it rather than failing the whole add.
    if (!songSection) continue;
    await insertCueItem(serviceId, section, {
      type: "song_section",
      label: `${song.title} — ${songSection.label}`,
      text: songSection.lyrics,
      songSectionId: songSection.id,
    });
  }

  await syncSongArrangement(serviceId, songId);
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function addAnnouncementSlideCueAction(
  serviceId: string,
  section: CueSection,
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

  await insertCueItem(serviceId, section, {
    type: "announcement_slide",
    label: slide.announcement.title,
    text: slide.text,
  });
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function addCustomTextCueAction(
  serviceId: string,
  section: CueSection,
  customTextId: string,
): Promise<void> {
  const { membership } = await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const item = await db.query.customTexts.findFirst({ where: eq(customTexts.id, customTextId) });
  if (!item || item.churchId !== membership.church.id) {
    throw new Error("Custom text not found.");
  }

  await insertCueItem(serviceId, section, { type: "custom_text", label: item.title, text: item.text });
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

// Custom text is meant for one-off use ("type it once, put it on screen" —
// see the library README/schema comment), so this creates the library
// entry (for potential reuse later) *and* cues it into this service in one
// step, rather than requiring a trip to the Library page first.
export async function createAndAddCustomTextCueAction(
  serviceId: string,
  section: CueSection,
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

  await insertCueItem(serviceId, section, { type: "custom_text", label: trimmedTitle, text: trimmedText });
  revalidatePath(`/dashboard/prep/${serviceId}`);
}

export async function removeCueItemAction(serviceId: string, cueItemId: string): Promise<void> {
  await requirePrepAccess();
  if (!db) throw new Error("Database is not configured.");

  const [item] = await db
    .select()
    .from(cueItems)
    .where(and(eq(cueItems.id, cueItemId), eq(cueItems.serviceId, serviceId)));
  if (!item) return;

  await db.delete(cueItems).where(eq(cueItems.id, cueItemId));

  if (item.songSectionId) {
    const songSection = await db.query.songSections.findFirst({ where: eq(songSections.id, item.songSectionId) });
    if (songSection) await syncSongArrangement(serviceId, songSection.songId);
  }

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

  // Scoped to the same section as `current` — moving up/down reorders
  // within Pre-service/Warm-up/Service/Post-service, never across them
  // (dragging an item to a different section isn't supported yet; remove
  // and re-add it under the target section instead).
  //
  // "up" wants the closest earlier item (largest position < current);
  // "down" wants the closest later item (smallest position > current).
  const [neighbor] =
    direction === "up"
      ? await db
          .select()
          .from(cueItems)
          .where(
            and(
              eq(cueItems.serviceId, serviceId),
              eq(cueItems.section, current.section),
              lt(cueItems.position, current.position),
            ),
          )
          .orderBy(desc(cueItems.position))
          .limit(1)
      : await db
          .select()
          .from(cueItems)
          .where(
            and(
              eq(cueItems.serviceId, serviceId),
              eq(cueItems.section, current.section),
              gt(cueItems.position, current.position),
            ),
          )
          .orderBy(asc(cueItems.position))
          .limit(1);
  if (!neighbor) return;

  await db.update(cueItems).set({ position: neighbor.position }).where(eq(cueItems.id, current.id));
  await db.update(cueItems).set({ position: current.position }).where(eq(cueItems.id, neighbor.id));

  const touchedSongSectionIds = [current.songSectionId, neighbor.songSectionId].filter(
    (id): id is string => id !== null,
  );
  if (touchedSongSectionIds.length > 0) {
    const touchedSections = await db.query.songSections.findMany({
      where: inArray(songSections.id, touchedSongSectionIds),
    });
    const songIds = new Set(touchedSections.map((s) => s.songId));
    for (const songId of songIds) {
      await syncSongArrangement(serviceId, songId);
    }
  }

  revalidatePath(`/dashboard/prep/${serviceId}`);
}
