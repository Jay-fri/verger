"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { runMockDetectionChunkAction, setServiceStatusAction } from "@/lib/services/detection";
import { setLiveStateAction } from "@/lib/services/live-state-action";
import { getAdjacentVerseAction, type VerseSearchResult } from "@/lib/services/search";
import { CueListPane } from "./cue-list-pane";
import { LiveOutputPane } from "./live-output-pane";
import { AiDetectedPane } from "./ai-detected-pane";
import { QuickInsertPanel, type LibrarySong } from "./quick-insert-panel";
import type { CueItem, DetectedEntry, LiveItem, VerseReference } from "./types";

const CHUNK_DELAY_MS = 2500;
const TOTAL_MOCK_CHUNKS = 10;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function verseReferenceOf(item: CueItem): VerseReference | null {
  if (item.type !== "verse" || !item.translation || !item.book || item.chapter == null || item.verse == null) {
    return null;
  }
  return { translation: item.translation, book: item.book, chapter: item.chapter, verse: item.verse };
}

type Service = { id: string; title: string; status: string };

export function ControlConsole({
  service,
  cueItems,
  librarySongs,
  role,
}: {
  service: Service;
  cueItems: CueItem[];
  librarySongs: LibrarySong[];
  role: string;
}) {
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LiveItem | null>(null);
  const [entries, setEntries] = useState<DetectedEntry[]>([]);
  const [sessionState, setSessionState] = useState<"idle" | "running" | "finished">("idle");
  const [currentChunkText, setCurrentChunkText] = useState<string | null>(null);
  const [navPending, setNavPending] = useState(false);
  const cancelledRef = useRef(false);

  const activeCueIndex = activeCueId ? cueItems.findIndex((c) => c.id === activeCueId) : -1;
  const activeCue = activeCueIndex >= 0 ? (cueItems[activeCueIndex] ?? null) : null;
  const nextCue = activeCueIndex >= 0 ? (cueItems[activeCueIndex + 1] ?? null) : (cueItems[0] ?? null);

  // The one place "current" ever changes — updates local state immediately
  // (so the operator's own screen never waits on a round trip) and persists
  // to live_state, which is what actually notifies the Stage output route
  // via Postgres Changes. Every call site that used to call setCurrent
  // directly goes through this instead.
  function pushLive(item: LiveItem) {
    setCurrent(item);
    setLiveStateAction(service.id, item).catch(() => {});
  }

  function pushCueLive(item: CueItem) {
    setActiveCueId(item.id);
    pushLive({
      source: "cue",
      type: item.type,
      label: item.label,
      text: item.text,
      reference: verseReferenceOf(item),
    });
  }

  function pushSearchResultLive(verse: VerseSearchResult) {
    pushLive({
      source: "search",
      type: "verse",
      label: verse.label,
      text: verse.text,
      reference: {
        translation: verse.translation,
        book: verse.book,
        chapter: verse.chapter,
        verse: verse.verse,
      },
    });
  }

  // Quick-insert pushes deliberately never touch activeCueId — that's what
  // lets an ad-hoc push override the live output without disturbing the
  // operator's position in the order-of-service cue list.
  function pushQuickLive(item: Omit<LiveItem, "source">) {
    pushLive({ ...item, source: "quick" });
  }

  function resumeActiveCue() {
    if (activeCue) pushCueLive(activeCue);
  }

  async function navigateVerse(direction: "next" | "prev") {
    if (!current?.reference || navPending) return;
    setNavPending(true);
    try {
      const adjacent = await getAdjacentVerseAction(current.reference, direction);
      if (!adjacent) return;
      pushLive({
        ...current,
        label: adjacent.label,
        text: adjacent.text,
        reference: {
          translation: adjacent.translation,
          book: adjacent.book,
          chapter: adjacent.chapter,
          verse: adjacent.verse,
        },
      });
    } finally {
      setNavPending(false);
    }
  }

  // Left/right arrow keys step through the live verse, same as clicking
  // Previous/Next — skipped while the operator is typing anywhere (search
  // boxes, quick-insert text area) so the keys keep their normal text-input
  // behavior there.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (!current?.reference) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;

      e.preventDefault();
      navigateVerse(e.key === "ArrowLeft" ? "prev" : "next");
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, navPending]);

  function confirmEntry(entryId: string) {
    // pushLive (setCurrent + the setLiveStateAction server action call) must
    // not run inside setEntries' updater — React can invoke that updater
    // during render, and triggering another component's setState there
    // (the Server Action call updates router-pending state) throws "Cannot
    // update a component while rendering a different component."
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    pushLive({
      source: "detection",
      type: "verse",
      label: entry.label,
      text: entry.text,
      reference: {
        translation: entry.translation,
        book: entry.book,
        chapter: entry.chapter,
        verse: entry.verse,
      },
    });
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, status: "confirmed" } : e)));
  }

  function dismissEntry(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  async function startMockSession() {
    if (sessionState === "running") return;
    cancelledRef.current = false;
    setSessionState("running");
    setServiceStatusAction(service.id, "live").catch(() => {});

    for (let i = 0; i < TOTAL_MOCK_CHUNKS; i++) {
      if (cancelledRef.current) break;

      setCurrentChunkText(null);
      const result = await runMockDetectionChunkAction(service.id, i);
      if (cancelledRef.current) break;

      setCurrentChunkText(result.chunkText || null);

      if (result.match) {
        const { match } = result;
        const entryId = `${service.id}-${i}-${match.book}-${match.chapter}-${match.verse}`;

        if (match.decision === "auto-display") {
          pushLive({
            source: "detection",
            type: "verse",
            label: match.label,
            text: match.text,
            reference: {
              translation: match.translation,
              book: match.book,
              chapter: match.chapter,
              verse: match.verse,
            },
          });
          setEntries((prev) => [
            {
              id: entryId,
              status: "confident",
              translation: match.translation,
              book: match.book,
              chapter: match.chapter,
              verse: match.verse,
              label: match.label,
              text: match.text,
              chunkText: result.chunkText,
            },
            ...prev,
          ]);
        } else {
          setEntries((prev) => [
            {
              id: entryId,
              status: "needs-review",
              translation: match.translation,
              book: match.book,
              chapter: match.chapter,
              verse: match.verse,
              label: match.label,
              text: match.text,
              chunkText: result.chunkText,
            },
            ...prev,
          ]);
        }
      }

      if (result.isLastChunk) break;
      await sleep(CHUNK_DELAY_MS);
    }

    if (!cancelledRef.current) {
      setSessionState("finished");
    }
    setCurrentChunkText(null);
  }

  function stopMockSession() {
    cancelledRef.current = true;
    setSessionState("finished");
    setCurrentChunkText(null);
    setServiceStatusAction(service.id, "ended").catch(() => {});
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/console"
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            ← Dashboard
          </Link>
          <div>
            <p className="text-xs font-medium tracking-wide text-text-secondary uppercase">
              Control console
            </p>
            <h1 className="text-lg font-semibold text-text-primary">{service.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={`/stage/${service.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            Open Stage output ↗
          </Link>
          {sessionState === "running" && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="bg-accent-gold h-1.5 w-1.5 animate-pulse rounded-full" />
              Mock session running…
            </span>
          )}
          {sessionState !== "running" ? (
            <button
              type="button"
              onClick={startMockSession}
              className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              {sessionState === "finished" ? "Restart mock session" : "Start mock session"}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopMockSession}
              className="border-live text-live hover:bg-live/10 rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Stop
            </button>
          )}
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 divide-y divide-border overflow-hidden lg:grid-cols-[280px_1fr_340px] lg:divide-x lg:divide-y-0">
        <div className="overflow-hidden">
          <CueListPane cueItems={cueItems} activeCueId={activeCueId} onSelect={pushCueLive} />
        </div>
        <div className="overflow-hidden">
          <LiveOutputPane
            current={current}
            next={nextCue}
            activeCue={activeCue}
            onResumeActiveCue={resumeActiveCue}
            onNavigateVerse={navigateVerse}
            navPending={navPending}
          >
            <QuickInsertPanel librarySongs={librarySongs} onPush={pushQuickLive} />
          </LiveOutputPane>
        </div>
        <div className="overflow-hidden">
          <AiDetectedPane
            entries={entries}
            currentChunkText={sessionState === "running" ? currentChunkText : null}
            onConfirm={confirmEntry}
            onDismiss={dismissEntry}
            onManualSelect={pushSearchResultLive}
          />
        </div>
      </div>

      {role === "volunteer" && (
        <p className="border-t border-border px-6 py-2 text-xs text-text-secondary">
          You&apos;re signed in as volunteer — you can run this console, but editing the outline
          happens in Prep (operator/admin only).
        </p>
      )}
    </div>
  );
}
