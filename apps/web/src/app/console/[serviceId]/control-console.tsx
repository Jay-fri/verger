"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ReferenceContext } from "@verger/bible-data";
import { BIBLE_TRANSLATIONS } from "@verger/shared-types";
import {
  runLiveDetectionChunkAction,
  runMockDetectionChunkAction,
  setDisplayModeAction,
  setServiceStatusAction,
  warmUpDetectionAction,
  type MockDetectionMatch,
} from "@/lib/services/detection";
import {
  setLiveStateAction,
  setLiveStateModeAction,
  setOperatorMessageAction,
} from "@/lib/services/live-state-action";
import type { LiveStateMode } from "@/lib/services/live-state";
import {
  getAdjacentVerseAction,
  getVerseInTranslationAction,
  type VerseSearchResult,
} from "@/lib/services/search";
import { sortBySectionThenPosition, computeNextCue } from "@/lib/services/cue-sections";
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
// Minimum time anything pushed to the live output stays up before an
// AUTOMATIC (AI) push is allowed to replace it — prevents the AI flickering
// between rapid re-detections. Deliberately does NOT apply to operator
// actions (cue click, AI confirm tap, quick-insert, verse next/prev, panic
// buttons) — those always take effect immediately; see pushLive's `auto`
// parameter and recordMatch below. ~3-4s per the feature spec; tune here.
const MIN_DISPLAY_TIME_MS = 3500;

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

type Service = { id: string; title: string; status: string; displayMode: "auto" | "manual" };

export function ControlConsole({
  service,
  cueItems: rawCueItems,
  librarySongs,
  role,
  defaultTranslation,
}: {
  service: Service;
  cueItems: CueItem[];
  librarySongs: LibrarySong[];
  role: string;
  /** The church's default translation — the session starts on this, but the switcher below can change it any time, for the rest of the session only. */
  defaultTranslation: string;
}) {
  // Sorted once here (section order, then position) — every consumer below
  // (CueListPane, next-cue computation, navigation) relies on this order
  // rather than re-sorting itself.
  const cueItems = sortBySectionThenPosition(rawCueItems);

  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LiveItem | null>(null);
  const [entries, setEntries] = useState<DetectedEntry[]>([]);
  const [sessionState, setSessionState] = useState<"idle" | "running" | "finished">("idle");
  const [currentChunkText, setCurrentChunkText] = useState<string | null>(null);
  const [navPending, setNavPending] = useState(false);
  const [displayMode, setDisplayModeState] = useState<"auto" | "manual">(service.displayMode);
  const [operatorMessage, setOperatorMessage] = useState("");
  // Session-level — starts on the church's default, switchable any time for
  // the rest of the session (unlike Auto/Manual, this is never locked once
  // a session starts; see the switcher UI below). Read by every detection/
  // search call this component makes, and drives changeDisplayTranslation's
  // instant re-fetch-and-push of whatever's currently live.
  const [displayTranslation, setDisplayTranslationState] = useState(defaultTranslation);
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
  // Timestamp of the most recent live-output push, from ANY source — the
  // minimum-display-time debounce (MIN_DISPLAY_TIME_MS) protects whatever's
  // currently up from an AUTOMATIC replacement until this much time has
  // passed, regardless of how the current content got there.
  const lastPushedAtRef = useRef(0);

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
      result = await runLiveDetectionChunkAction(service.id, text, displayTranslation, currentReferenceContext());
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

  const activeCue = activeCueId ? (cueItems.find((c) => c.id === activeCueId) ?? null) : null;
  const nextCue = computeNextCue(cueItems, activeCueId);

  // The one place "current" ever changes — updates local state immediately
  // (so the operator's own screen never waits on a round trip) and persists
  // to live_state, which is what actually notifies the Stage output route
  // via Postgres Changes. Every call site that used to call setCurrent
  // directly goes through this instead.
  //
  // `next` is only ever passed by cue-related pushes (pushCueLive) — every
  // other source (quick-insert, search, AI) omits it entirely, which
  // (per setLiveStateAction's partial-update behavior) leaves whatever the
  // Stage confidence monitor is currently showing as "Next" untouched,
  // since only the order-of-service position — not what happens to be live
  // right now — determines what's next.
  //
  // `preserveMode` is only ever true for changeDisplayTranslation's re-push
  // below: switching translation while Clear/Black/Logo is engaged should
  // update the underlying verse for whenever the operator resumes content,
  // not silently un-black the stage as a side effect of an unrelated
  // action. Every other push (a cue, a search result, a confirm) is a
  // deliberate return to real content, so it keeps the normal
  // mode-always-resets-to-content behavior.
  function pushLive(
    item: LiveItem,
    next?: { label: string; text: string; type: CueItem["type"] } | null,
    preserveMode = false,
  ) {
    const mode = preserveMode ? (current?.mode ?? "content") : "content";
    setCurrent({ ...item, mode });
    lastPushedAtRef.current = Date.now();
    const t0 = performance.now();
    setLiveStateAction(service.id, {
      source: item.source,
      type: item.type,
      label: item.label,
      text: item.text,
      mode,
      // Verse-only — null for every other cue type, same as cue_items'
      // own verse-only fields. This is what changeDisplayTranslation
      // reads back (via live_state, on a future page load) and what makes
      // a translation switch a plain reference re-lookup rather than
      // needing detection to run again.
      translation: item.reference?.translation ?? null,
      book: item.reference?.book ?? null,
      chapter: item.reference?.chapter ?? null,
      verse: item.reference?.verse ?? null,
      ...(next !== undefined
        ? { nextLabel: next?.label ?? null, nextText: next?.text ?? null, nextType: next?.type ?? null }
        : {}),
    })
      .then(() => console.info(`[latency] stage-sync done for "${item.label}" in ${(performance.now() - t0).toFixed(0)}ms`))
      .catch(() => {});
  }

  // A verse cue caches its text at add-time in Prep, in whatever
  // translation was active there — same content-caching philosophy as
  // every other cue type. But "future pushes [respect the session
  // translation] for the rest of the session" (per the switcher's spec)
  // has to include cue clicks too, not just AI matches/search, or clicking
  // a verse cue after switching translation would silently revert to
  // whatever the cue happened to be built in. So a verse cue whose cached
  // translation doesn't match the session's current displayTranslation
  // gets the same decoupled reference re-lookup changeDisplayTranslation
  // uses — never detection, just the plain lookup.
  async function pushCueLive(item: CueItem) {
    setActiveCueId(item.id);
    const upcoming = computeNextCue(cueItems, item.id);
    const next = upcoming ? { label: upcoming.label, text: upcoming.text, type: upcoming.type } : null;

    const ref = verseReferenceOf(item);
    if (ref && ref.translation !== displayTranslation) {
      const fetched = await getVerseInTranslationAction(
        { book: ref.book, chapter: ref.chapter, verse: ref.verse },
        displayTranslation,
      );
      if (fetched) {
        pushLive(
          {
            source: "cue",
            type: item.type,
            label: fetched.label,
            text: fetched.text,
            reference: {
              translation: fetched.translation,
              book: fetched.book,
              chapter: fetched.chapter,
              verse: fetched.verse,
            },
          },
          next,
        );
        return;
      }
    }

    pushLive(
      { source: "cue", type: item.type, label: item.label, text: item.text, reference: ref },
      next,
    );
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

  // Clear/Black/Logo — always-available panic buttons, always operator-
  // initiated, so (per the feature spec) they bypass the minimum-display-
  // time debounce entirely: they call setLiveStateModeAction directly
  // rather than going through pushLive/recordMatch's automatic-replacement
  // throttling. Still reset lastPushedAtRef, the same as any other
  // operator push, so an AI auto-display can't immediately flicker over a
  // Black screen the instant it goes up.
  function pushPanicMode(mode: LiveStateMode) {
    setCurrent((prev) => (prev ? { ...prev, mode } : { source: "quick", type: "custom_text", label: "", text: "", reference: null, mode }));
    lastPushedAtRef.current = Date.now();
    setLiveStateModeAction(service.id, mode).catch(() => {});
  }

  // Switchable any time, mid-session, unlike Auto/Manual — see the
  // switcher UI below. Never touches detection: if a verse is currently
  // live, this re-fetches that exact (book, chapter, verse) reference in
  // the newly chosen translation and re-pushes it, the same plain lookup
  // getAdjacentVerseAction already does for Previous/Next verse. Future
  // pushes (a new cue, a new search, a new AI match) pick up the new
  // displayTranslation value on their own, no separate propagation needed.
  async function changeDisplayTranslation(translation: string) {
    setDisplayTranslationState(translation);
    const ref = current?.reference;
    if (!ref) return;

    const t0 = performance.now();
    const fetched = await getVerseInTranslationAction(
      { book: ref.book, chapter: ref.chapter, verse: ref.verse },
      translation,
    );
    console.info(
      `[translation] re-fetched ${ref.book} ${ref.chapter}:${ref.verse} in ${translation} — ` +
        `${(performance.now() - t0).toFixed(0)}ms, no detection involved`,
    );
    if (!fetched) return;

    pushLive(
      {
        ...current,
        text: fetched.text,
        label: fetched.label,
        reference: {
          translation: fetched.translation,
          book: fetched.book,
          chapter: fetched.chapter,
          verse: fetched.verse,
        },
      },
      undefined,
      true, // preserveMode — see pushLive's doc comment
    );
  }

  function sendOperatorMessage() {
    setOperatorMessageAction(service.id, operatorMessage.trim() || null).catch(() => {});
  }

  function clearOperatorMessage() {
    setOperatorMessage("");
    setOperatorMessageAction(service.id, null).catch(() => {});
  }

  function changeDisplayMode(mode: "auto" | "manual") {
    setDisplayModeState(mode);
    setDisplayModeAction(service.id, mode).catch(() => {});
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
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, status: "confirmed", autoDisplayed: false } : e)),
    );
  }

  function dismissEntry(entryId: string) {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  // Shared by the mock-demo loop and the live AssemblyAI path: turns one
  // flattened detection match into either an auto-displayed live push or a
  // needs-review/confident queue entry. entryKey only has to be unique per
  // chunk within this session (the mock loop uses its chunk index; the live
  // path uses an incrementing counter, since there's no array index to
  // reuse).
  //
  // A confidence "auto-display" decision from the engine is necessary but
  // not sufficient for an actual automatic push to the live output — two
  // more gates apply, both session/operator-controlled rather than
  // confidence-related: Manual mode (nothing auto-pushes, ever, regardless
  // of confidence) and the minimum-display-time debounce (a too-soon
  // automatic replacement is suppressed, not dropped — the match still
  // lands in the queue with autoDisplayed: false, so the operator can
  // confirm it immediately with one tap if they want it up sooner than the
  // debounce would allow). The queue's sage/terracotta coloring (status)
  // always reflects the engine's real confidence either way — see
  // DetectedEntry's doc comment.
  function recordMatch(match: MockDetectionMatch, chunkText: string, entryKey: string) {
    const entryId = `${service.id}-${entryKey}-${match.book}-${match.chapter}-${match.verse}`;
    let autoDisplayed = false;

    if (match.decision === "auto-display") {
      if (displayMode === "manual") {
        console.info(`[display-mode] suppressed auto-display of ${match.label} — session is in Manual mode`);
      } else {
        const elapsed = Date.now() - lastPushedAtRef.current;
        if (elapsed >= MIN_DISPLAY_TIME_MS) {
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
          autoDisplayed = true;
        } else {
          console.info(
            `[debounce] suppressed auto-display of ${match.label} — ` +
              `${MIN_DISPLAY_TIME_MS - elapsed}ms left on minimum display window`,
          );
        }
      }
    }

    setEntries((prev) => [
      {
        id: entryId,
        status: match.decision === "auto-display" ? "confident" : "needs-review",
        autoDisplayed,
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
      const result = await runMockDetectionChunkAction(service.id, i, displayTranslation);
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
  const isSessionIdle = !isLiveActive && !isMockActive && sessionState === "idle";
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
          {/* Unlike Auto/Manual, switchable any time — mid-session, mid-
              verse, no lock. Applies instantly to whatever's currently
              live (a plain reference re-fetch, not a re-detection) and to
              every future push for the rest of the session. */}
          <label className="flex items-center gap-1.5 text-xs font-medium text-text-secondary">
            Translation
            <select
              value={displayTranslation}
              onChange={(e) => changeDisplayTranslation(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-text-primary focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
            >
              {BIBLE_TRANSLATIONS.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code}
                </option>
              ))}
            </select>
          </label>
          {/* Auto/Manual is chosen once, when a session starts — locked once
              a mock or live session is actually running, so it can't be
              changed mid-session and mean something different for matches
              already in flight. */}
          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 text-xs font-medium">
            <button
              type="button"
              disabled={!isSessionIdle}
              onClick={() => changeDisplayMode("auto")}
              title="High-confidence matches display automatically"
              className={`rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                displayMode === "auto" ? "bg-accent-gold text-background" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Auto
            </button>
            <button
              type="button"
              disabled={!isSessionIdle}
              onClick={() => changeDisplayMode("manual")}
              title="Every match goes through the queue for a one-tap confirm"
              className={`rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                displayMode === "manual" ? "bg-accent-gold text-background" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              Manual
            </button>
          </div>
          <Link
            href={`/stage/${service.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            Open Stage output ↗
          </Link>
          <Link
            href={`/monitor/${service.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-primary hover:bg-background"
          >
            Open confidence monitor ↗
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
            onPanic={pushPanicMode}
            operatorMessage={operatorMessage}
            onOperatorMessageChange={setOperatorMessage}
            onSendOperatorMessage={sendOperatorMessage}
            onClearOperatorMessage={clearOperatorMessage}
          >
            <QuickInsertPanel librarySongs={librarySongs} onPush={pushQuickLive} translation={displayTranslation} />
          </LiveOutputPane>
        </div>
        <div className="overflow-hidden">
          <AiDetectedPane
            entries={entries}
            currentChunkText={displayedChunkText}
            onConfirm={confirmEntry}
            onDismiss={dismissEntry}
            onManualSelect={pushSearchResultLive}
            translation={displayTranslation}
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
