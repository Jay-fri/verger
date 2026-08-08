"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReferenceContext } from "@verger/bible-data";
import {
  runLiveDetectionChunkAction,
  runMockDetectionChunkAction,
  setServiceStatusAction,
  warmUpDetectionAction,
  type MockDetectionMatch,
} from "@/lib/services/detection";
import { setLiveStateAction } from "@/lib/services/live-state-action";
import { getAdjacentVerseAction, type VerseSearchResult } from "@/lib/services/search";
import { CueListPane } from "./cue-list-pane";
import { LiveOutputPane } from "./live-output-pane";
import { AiDetectedPane } from "./ai-detected-pane";
import { QuickInsertPanel, type LibrarySong } from "./quick-insert-panel";
import { useLiveTranscription } from "./use-live-transcription";
import type { CueItem, DetectedEntry, LiveItem, VerseReference } from "./types";

const CHUNK_DELAY_MS = 2500;
const TOTAL_MOCK_CHUNKS = 10;
// How long a carried-forward book/chapter context stays usable for
// resolving a bare "verse N" mention. Long enough for "Romans chapter 8...
// [a few seconds later]... verse 28", short enough to limit how long a
// stale context could mis-resolve something unrelated (e.g. a song's
// "verse 2" mentioned well after the last scripture reference).
const REFERENCE_CONTEXT_TTL_MS = 45_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  const liveChunkCounterRef = useRef(0);
  // Verses already surfaced for the turn currently in progress (book:chapter:verse
  // keys) — reset once that turn finalizes. Exists because a still-growing
  // turn can get checked more than once via onPartialTranscript before it
  // finally finalizes; without this, the same verse mentioned in an early
  // partial check would show up twice: once from that check, again from the
  // eventual final.
  const seenInCurrentTurnRef = useRef<Set<string>>(new Set());
  // Last book/chapter this session has established, for resolving a bare
  // "verse N" mentioned with no book/chapter restated — see
  // REFERENCE_CONTEXT_TTL_MS and findAllReferences in @verger/bible-data.
  const referenceContextRef = useRef<{ context: ReferenceContext; setAt: number } | null>(null);
  // True while a detection round trip is in flight. Real finding from live
  // testing: without this, a new partial check fires every 1.5s regardless
  // of whether the previous one has resolved yet, and since each round trip
  // was taking ~1s, several would end up in flight at once, queuing up
  // behind each other and making round trips measured in the 5-8s range
  // instead of ~1s. Partial checks are skipped (not queued) while one is
  // already running — the next partial 1.5s later, or the eventual final,
  // catches up regardless. Finals are never skipped.
  const processingChunkRef = useRef(false);

  function verseKey(match: MockDetectionMatch): string {
    return `${match.book}:${match.chapter}:${match.verse}`;
  }

  function currentReferenceContext(): ReferenceContext | undefined {
    const entry = referenceContextRef.current;
    if (!entry) return undefined;
    if (Date.now() - entry.setAt > REFERENCE_CONTEXT_TTL_MS) return undefined;
    return entry.context;
  }

  // Shared by both the finalized-turn and growing-partial paths — see
  // use-live-transcription.ts's onFinalTranscript/onPartialTranscript.
  // Logs a client-side latency trace (chunk received -> action round trip)
  // that lines up with detectChunkEvents' own server-side match-start/
  // match-done logs by chunk text, since the two run in different processes.
  //
  // performance.now()/Date.now() below are flagged by the react-hooks/purity
  // rule because this function is passed as an argument into the
  // useLiveTranscription() hook call further down, and the compiler can't
  // see across that boundary to confirm it's only ever invoked later, from a
  // WebSocket message handler — never synchronously during render. It
  // genuinely isn't (see use-live-transcription.ts's onFinalTranscriptRef/
  // onPartialTranscriptRef — both are only read from ws.onmessage).
  /* eslint-disable react-hooks/purity */
  async function processLiveChunk(text: string, isPartial: boolean) {
    if (isPartial && processingChunkRef.current) return;
    processingChunkRef.current = true;

    const t0 = performance.now();
    const chunkKey = `live-${isPartial ? "partial" : "final"}-${liveChunkCounterRef.current++}`;
    console.info(`[latency] ${chunkKey} received (${isPartial ? "partial" : "final"}) — "${text.slice(0, 70)}"`);

    let result: Awaited<ReturnType<typeof runLiveDetectionChunkAction>>;
    try {
      result = await runLiveDetectionChunkAction(service.id, text, currentReferenceContext());
    } finally {
      processingChunkRef.current = false;
    }
    console.info(
      `[latency] ${chunkKey} round trip ${(performance.now() - t0).toFixed(0)}ms ` +
        `(server-reported ${result.timings.durationMs}ms) — ${result.matches.length} match(es)`,
    );

    if (result.context) {
      referenceContextRef.current = { context: result.context, setAt: Date.now() };
    }

    const fresh = result.matches.filter((match) => !seenInCurrentTurnRef.current.has(verseKey(match)));
    fresh.forEach((match, i) => {
      if (isPartial) seenInCurrentTurnRef.current.add(verseKey(match));
      recordMatch(match, result.chunkText, `${chunkKey}-${i}`);
    });
    if (!isPartial) {
      seenInCurrentTurnRef.current = new Set(); // the next turn starts clean
    }
  }
  /* eslint-enable react-hooks/purity */

  const live = useLiveTranscription({
    serviceId: service.id,
    onFinalTranscript: (text) => processLiveChunk(text, false),
    onPartialTranscript: (text) => processLiveChunk(text, true),
  });

  // Pays the local embedding model's one-time load cost as soon as the
  // console opens rather than on whichever transcript chunk needs semantic
  // search first — see warmUpDetectionAction's doc comment for the finding
  // that motivated this.
  useEffect(() => {
    warmUpDetectionAction(service.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const t0 = performance.now();
    setLiveStateAction(service.id, item)
      .then(() => console.info(`[latency] stage-sync done for "${item.label}" in ${(performance.now() - t0).toFixed(0)}ms`))
      .catch(() => {});
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

  // Shared by the mock-demo loop and the live AssemblyAI path: turns one
  // flattened detection match into either an auto-displayed live push or a
  // needs-review queue entry. entryKey only has to be unique per chunk
  // within this session (the mock loop uses its chunk index; the live path
  // uses an incrementing counter, since there's no array index to reuse).
  function recordMatch(match: MockDetectionMatch, chunkText: string, entryKey: string) {
    const entryId = `${service.id}-${entryKey}-${match.book}-${match.chapter}-${match.verse}`;

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
    }

    setEntries((prev) => [
      {
        id: entryId,
        status: match.decision === "auto-display" ? "confident" : "needs-review",
        translation: match.translation,
        book: match.book,
        chapter: match.chapter,
        verse: match.verse,
        label: match.label,
        text: match.text,
        chunkText,
      },
      ...prev,
    ]);
  }

  async function startMockSession() {
    if (sessionState === "running" || live.state !== "idle") return;
    cancelledRef.current = false;
    setSessionState("running");
    setServiceStatusAction(service.id, "live").catch(() => {});

    for (let i = 0; i < TOTAL_MOCK_CHUNKS; i++) {
      if (cancelledRef.current) break;

      setCurrentChunkText(null);
      const result = await runMockDetectionChunkAction(service.id, i);
      if (cancelledRef.current) break;

      setCurrentChunkText(result.chunkText || null);

      result.matches.forEach((match, j) => recordMatch(match, result.chunkText, `${i}-${j}`));

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

  function startLiveSession() {
    if (sessionState === "running") return;
    setServiceStatusAction(service.id, "live").catch(() => {});
    live.start();
  }

  function stopLiveSession() {
    live.stop();
    setServiceStatusAction(service.id, "ended").catch(() => {});
  }

  const isLiveActive =
    live.state === "requesting-mic" ||
    live.state === "connecting" ||
    live.state === "listening" ||
    live.state === "reconnecting";
  const isMockActive = sessionState === "running";
  const liveButtonLabel =
    live.state === "error"
      ? "Retry live session"
      : live.state === "stopped"
        ? "Restart live session"
        : "Start live session";
  const displayedChunkText = isMockActive ? currentChunkText : isLiveActive ? live.partialText || null : null;
  const approxCost = ((live.connectedSeconds / 60) * 0.01).toFixed(2);

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
          {live.state === "listening" && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="bg-live h-1.5 w-1.5 animate-pulse rounded-full" />
              Listening · {formatDuration(live.connectedSeconds)}
              <span className="text-text-secondary/70">(~${approxCost})</span>
            </span>
          )}
          {live.state === "reconnecting" && (
            <span className="text-needs-review flex items-center gap-1.5 text-xs">
              <span className="bg-needs-review h-1.5 w-1.5 animate-pulse rounded-full" />
              Reconnecting… (attempt {live.reconnectAttempt})
            </span>
          )}
          {(live.state === "requesting-mic" || live.state === "connecting") && (
            <span className="text-xs text-text-secondary">
              {live.state === "requesting-mic" ? "Requesting microphone…" : "Connecting…"}
            </span>
          )}
          {live.state === "error" && live.error && (
            <span className="text-live text-xs font-medium">{live.error}</span>
          )}
          {isMockActive && (
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className="bg-accent-gold h-1.5 w-1.5 animate-pulse rounded-full" />
              Mock demo running…
            </span>
          )}

          {isLiveActive ? (
            <button
              type="button"
              onClick={stopLiveSession}
              className="border-live text-live hover:bg-live/10 rounded-lg border px-4 py-2 text-sm font-medium"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={startLiveSession}
              disabled={isMockActive}
              className="rounded-lg bg-accent-gold px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {liveButtonLabel}
            </button>
          )}

          {!isLiveActive &&
            (isMockActive ? (
              <button
                type="button"
                onClick={stopMockSession}
                className="text-xs font-medium text-text-secondary underline hover:text-text-primary"
              >
                Stop demo
              </button>
            ) : (
              <button
                type="button"
                onClick={startMockSession}
                className="text-xs text-text-secondary underline hover:text-text-primary"
              >
                or run mock demo
              </button>
            ))}
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
            currentChunkText={displayedChunkText}
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
