"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ReferenceContext } from "@verger/bible-data";
import { BIBLE_TRANSLATIONS } from "@verger/shared-types";
import {
  IconArrowLeft,
  IconClipboardList,
  IconGripHorizontal,
  IconGripVertical,
  IconPlayerPause,
  IconPlayerPlay,
} from "@tabler/icons-react";
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
import { getCueItemsAction } from "@/lib/services/actions";
import { getAdjacentVerseAction, getVerseInTranslationAction } from "@/lib/services/search";
import { CUE_SECTIONS, groupBySection, sortBySectionThenPosition, computeNextCue, type CueSection } from "@/lib/services/cue-sections";
import { OrderOfServicePanel } from "./order-of-service-panel";
import { LiveOutputPane } from "./live-output-pane";
import { AiDetectedPane } from "./ai-detected-pane";
import { QuickInsertPanel } from "./quick-insert-panel";
import { useLiveTranscription } from "./use-live-transcription";
import type { CueItem, DetectedEntry, LiveItem, VerseReference } from "./types";

const CHUNK_DELAY_MS = 2500;
const TOTAL_MOCK_CHUNKS = 10;
const REFERENCE_CONTEXT_TTL_MS = 45_000;
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

// Live mode's three panels (Quick Insert, Live Output/Order of Service,
// AI Detected) are user-resizable via the drag handles between them —
// defaults, drag bounds, and where the chosen sizes persist across reloads.
const DEFAULT_QUICK_INSERT_WIDTH = 280;
const DEFAULT_AI_DETECTED_WIDTH = 340;
const DEFAULT_LIVE_OUTPUT_HEIGHT = 420;
const QUICK_INSERT_WIDTH_RANGE = { min: 220, max: 480 };
const AI_DETECTED_WIDTH_RANGE = { min: 260, max: 560 };
const LIVE_OUTPUT_HEIGHT_RANGE = { min: 200, max: 720 };
const PANEL_SIZES_STORAGE_KEY = "verger:live-panel-sizes";

type PanelSizeField = "quickInsertWidth" | "aiDetectedWidth" | "liveOutputHeight";

function loadPanelSizes(): Partial<Record<PanelSizeField, number>> {
  try {
    const raw = localStorage.getItem(PANEL_SIZES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePanelSize(field: PanelSizeField, value: number) {
  try {
    const saved = loadPanelSizes();
    saved[field] = value;
    localStorage.setItem(PANEL_SIZES_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // best-effort — a failed write just means this size resets on next load
  }
}

// Not a React hook (no useState/useRef inside) despite the drag-resize
// naming convention elsewhere — a plain factory for a mousedown handler,
// safe to create fresh on every render like any other inline event handler.
// `invert` is for handles anchored to the trailing edge (AI Detected's,
// on the right): dragging left there should *grow* the panel, the opposite
// of the leading-edge Quick Insert handle.
function createResizeHandler({
  axis,
  value,
  setValue,
  range,
  invert = false,
  field,
}: {
  axis: "x" | "y";
  value: number;
  setValue: (next: number) => void;
  range: { min: number; max: number };
  invert?: boolean;
  field: PanelSizeField;
}) {
  return (e: ReactMouseEvent) => {
    e.preventDefault();
    const startPos = axis === "x" ? e.clientX : e.clientY;
    const startValue = value;
    let finalValue = value;

    document.body.style.cursor = axis === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      const pos = axis === "x" ? ev.clientX : ev.clientY;
      const rawDelta = pos - startPos;
      const delta = invert ? -rawDelta : rawDelta;
      finalValue = Math.min(range.max, Math.max(range.min, startValue + delta));
      setValue(finalValue);
    }
    function onMouseUp() {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      savePanelSize(field, finalValue); // persisted once at drag end, not per-frame
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };
}

const RESIZE_HANDLE_X_CLASS =
  "hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-border/60 hover:bg-accent-gold/30 active:bg-accent-gold/40";
const RESIZE_HANDLE_Y_CLASS =
  "flex h-1.5 shrink-0 cursor-row-resize items-center justify-center bg-border/60 hover:bg-accent-gold/30 active:bg-accent-gold/40";

type Service = { id: string; title: string; status: string; displayMode: "auto" | "manual" };
type LibraryAnnouncement = { id: string; title: string; slides: { id: string; text: string }[] };
type LibraryCustomText = { id: string; title: string; text: string };
type FullLibrarySong = { id: string; title: string; lastArrangement: string[] | null; sections: { id: string; label: string; lyrics: string }[] };

/**
 * The merged "Service" screen — Prep and the Control console are now one
 * component with a Prep/Live mode toggle, sharing the same order-of-service
 * state (see order-of-service-panel.tsx). Switching modes is local React
 * state, not a route change, so it never reloads the page.
 */
export function ServiceScreen({
  service,
  initialCueItems,
  librarySongs,
  libraryAnnouncements,
  libraryCustomTexts,
  role,
  editable,
  defaultTranslation,
  initialMode,
}: {
  service: Service;
  initialCueItems: CueItem[];
  librarySongs: FullLibrarySong[];
  libraryAnnouncements: LibraryAnnouncement[];
  libraryCustomTexts: LibraryCustomText[];
  role: string;
  /** Operator/admin — gates outline editing in Prep mode. Every role can run Live mode. */
  editable: boolean;
  defaultTranslation: string;
  initialMode: "prep" | "live";
}) {
  const [mode, setMode] = useState<"prep" | "live">(initialMode);
  const [cueItems, setCueItems] = useState<CueItem[]>(() => sortBySectionThenPosition(initialCueItems));

  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LiveItem | null>(null);
  const [entries, setEntries] = useState<DetectedEntry[]>([]);
  const [sessionState, setSessionState] = useState<"idle" | "running" | "finished">("idle");
  const [currentChunkText, setCurrentChunkText] = useState<string | null>(null);
  const [navPending, setNavPending] = useState(false);
  const [displayMode, setDisplayModeState] = useState<"auto" | "manual">(service.displayMode);
  const [operatorMessage, setOperatorMessage] = useState("");
  const [displayTranslation, setDisplayTranslationState] = useState(defaultTranslation);
  // Whether the detection engine runs at all — separate from Auto/Manual
  // (which only governs what happens to a match once *found*). Read from a
  // ref, not just the state value, because processLiveChunk and the mock
  // session's loop both need the CURRENT value at the moment a chunk
  // arrives/is about to be processed, not whatever was true when their
  // closure was created — the mock loop in particular runs across many
  // `await` ticks, so a plain state read there would be stale the instant
  // the operator toggles pause mid-session.
  const [detectionPaused, setDetectionPaused] = useState(false);
  const detectionPausedRef = useRef(false);
  // True only while the live (real AssemblyAI) connection was stopped
  // *because* of a pause, as opposed to the operator genuinely ending the
  // session with Stop — see toggleDetectionPaused/stopLiveSession. Drives
  // the header UI directly, so (unlike detectionPausedRef) this needs to be
  // real state, not a ref.
  const [pausedLiveSession, setPausedLiveSession] = useState(false);
  // AssemblyAI's connectedSeconds/cost resets to 0 every time a fresh
  // connection starts — accumulated here across pause/resume cycles so the
  // displayed total still reflects the whole live session, not just time
  // since the last resume. Reset only on a genuinely new session (see
  // startLiveSession), never on a pause-triggered reconnect.
  const [priorConnectedSeconds, setPriorConnectedSeconds] = useState(0);
  const [quickInsertWidth, setQuickInsertWidth] = useState(DEFAULT_QUICK_INSERT_WIDTH);
  const [aiDetectedWidth, setAiDetectedWidth] = useState(DEFAULT_AI_DETECTED_WIDTH);
  const [liveOutputHeight, setLiveOutputHeight] = useState(DEFAULT_LIVE_OUTPUT_HEIGHT);
  const cancelledRef = useRef(false);
  const liveChunkCounterRef = useRef(0);
  const seenInCurrentTurnRef = useRef<Set<string>>(new Set());
  const referenceContextRef = useRef<{ context: ReferenceContext; setAt: number } | null>(null);
  const processingChunkRef = useRef(false);
  const lastPushedAtRef = useRef(0);

  function switchMode(next: "prep" | "live") {
    setMode(next);
    // Cosmetic/bookmarkable only — bypasses the Next.js router entirely, so
    // this never triggers a data refetch or page reload.
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    window.history.replaceState(null, "", url.toString());
  }

  // Stops the detection engine from running at all — not just suppressing
  // display of what it finds. Toggleable at any time, mid-session, unlike
  // Auto/Manual (which locks once a session starts): pausing/resuming makes
  // sense specifically because the operator wants to do it mid-service, for
  // segments with no scripture content (offering, testimonies, etc.).
  //
  // For a real live session, this has to actually disconnect — AssemblyAI
  // bills per connected minute, so pausing only the matching step while the
  // mic/WebSocket keep streaming would still be spending money for no
  // reason during exactly the segments this feature exists for. The mock
  // demo has no such cost, so it's untouched here — its loop already skips
  // calling the detection action while paused instead (see
  // startMockSession).
  function toggleDetectionPaused() {
    const next = !detectionPaused;
    setDetectionPaused(next);
    detectionPausedRef.current = next;
    console.info(`[detection] ${next ? "paused" : "resumed"}`);

    if (next && isLiveActive) {
      console.info(`[detection] live session stopped for pause — mic and connection released, not billing`);
      setPriorConnectedSeconds((prev) => prev + live.connectedSeconds);
      setPausedLiveSession(true);
      live.stop();
    } else if (!next && pausedLiveSession) {
      console.info(`[detection] resuming — reconnecting live session`);
      setPausedLiveSession(false);
      live.start();
    }
  }

  async function refreshOutline() {
    const fresh = await getCueItemsAction(service.id);
    setCueItems(fresh);
  }

  function reorderOptimistic(section: CueSection, orderedIds: string[]) {
    setCueItems((prev) => {
      const grouped = groupBySection(prev);
      const idToItem = new Map(prev.map((i) => [i.id, i]));
      grouped[section] = orderedIds.map((id, idx) => ({ ...idToItem.get(id)!, position: idx }));
      return CUE_SECTIONS.flatMap((s) => grouped[s]);
    });
  }

  function verseKey(match: MockDetectionMatch): string {
    return `${match.book}:${match.chapter}:${match.verse}`;
  }

  function currentReferenceContext(): ReferenceContext | undefined {
    const entry = referenceContextRef.current;
    if (!entry) return undefined;
    if (Date.now() - entry.setAt > REFERENCE_CONTEXT_TTL_MS) return undefined;
    return entry.context;
  }

  /* eslint-disable react-hooks/purity */
  async function processLiveChunk(text: string, isPartial: boolean) {
    // Paused means the engine doesn't run at all — no server round trip,
    // not even a suppressed one. Bails before the [latency] log line below
    // so a paused session's console shows this rejection instead, never a
    // detection round trip.
    if (detectionPausedRef.current) {
      console.info(`[detection] paused — skipping ${isPartial ? "partial" : "final"} chunk entirely — "${text.slice(0, 70)}"`);
      return;
    }
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
      seenInCurrentTurnRef.current = new Set();
    }
  }
  /* eslint-enable react-hooks/purity */

  const live = useLiveTranscription({
    serviceId: service.id,
    onFinalTranscript: (text) => processLiveChunk(text, false),
    onPartialTranscript: (text) => processLiveChunk(text, true),
  });

  useEffect(() => {
    warmUpDetectionAction(service.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Panel sizes are a browser-local UI preference, not service data — read
  // once, after mount. Can't be a lazy useState initializer instead (the
  // usual way to avoid this exact lint rule): this page is server-rendered
  // first, localStorage doesn't exist in that environment, and computing a
  // different initial value on the client than what the server rendered
  // would be a hydration mismatch. One extra render right after mount, only
  // when a saved size differs from the default, is the correct tradeoff.
  useEffect(() => {
    const saved = loadPanelSizes();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof saved.quickInsertWidth === "number") setQuickInsertWidth(saved.quickInsertWidth);
    if (typeof saved.aiDetectedWidth === "number") setAiDetectedWidth(saved.aiDetectedWidth);
    if (typeof saved.liveOutputHeight === "number") setLiveOutputHeight(saved.liveOutputHeight);
  }, []);

  const nextCue = computeNextCue(cueItems, activeCueId);

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

    pushLive({ source: "cue", type: item.type, label: item.label, text: item.text, reference: ref }, next);
  }

  function pushQuickLive(item: Omit<LiveItem, "source">) {
    pushLive({ ...item, source: "quick" });
  }

  function pushPanicMode(mode: LiveStateMode) {
    setCurrent((prev) => (prev ? { ...prev, mode } : { source: "quick", type: "custom_text", label: "", text: "", reference: null, mode }));
    lastPushedAtRef.current = Date.now();
    setLiveStateModeAction(service.id, mode).catch(() => {});
  }

  async function changeDisplayTranslation(translation: string) {
    setDisplayTranslationState(translation);
    const ref = current?.reference;
    if (!ref) return;

    const fetched = await getVerseInTranslationAction(
      { book: ref.book, chapter: ref.chapter, verse: ref.verse },
      translation,
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
      true,
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (mode !== "live") return;
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
  }, [current, navPending, mode]);

  // The AI Detected panel's one interactive action, usable on ANY entry for
  // the rest of the session — pending, already-confirmed, or dismissed.
  // Re-tapping a historical entry re-pushes it live and (re-)marks it
  // confirmed; nothing is ever removed from `entries`, only its `action`
  // changes. See DetectedEntry's doc comment in types.ts.
  function selectEntry(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    pushLive({
      source: "detection",
      type: "verse",
      label: entry.label,
      text: entry.text,
      reference: { translation: entry.translation, book: entry.book, chapter: entry.chapter, verse: entry.verse },
    });
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, action: "confirmed" } : e)));
  }

  function dismissEntry(entryId: string) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, action: "dismissed" } : e)));
  }

  function recordMatch(match: MockDetectionMatch, chunkText: string, entryKey: string) {
    const entryId = `${service.id}-${entryKey}-${match.book}-${match.chapter}-${match.verse}`;
    let autoDisplayed = false;
    let action: DetectedEntry["action"] = "pending";

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
            reference: { translation: match.translation, book: match.book, chapter: match.chapter, verse: match.verse },
          });
          autoDisplayed = true;
          action = "confirmed";
        } else {
          console.info(`[debounce] suppressed auto-display of ${match.label} — ${MIN_DISPLAY_TIME_MS - elapsed}ms left`);
        }
      }
    }

    setEntries((prev) => [
      {
        id: entryId,
        confidence: match.decision === "auto-display" ? "confident" : "needs-review",
        action,
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

      if (detectionPausedRef.current) {
        console.info(`[detection] paused — skipping mock chunk ${i} entirely, no server call made`);
      } else {
        const result = await runMockDetectionChunkAction(service.id, i, displayTranslation);
        if (cancelledRef.current) break;

        setCurrentChunkText(result.chunkText || null);
        result.matches.forEach((match, j) => recordMatch(match, result.chunkText, `${i}-${j}`));

        if (result.isLastChunk) break;
      }

      await sleep(CHUNK_DELAY_MS);
    }

    if (!cancelledRef.current) setSessionState("finished");
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
    // A fresh, operator-initiated start always means "not paused" and
    // "new session" — clears any pause state and cost accounting left over
    // from a previous run, regardless of which control (this button, or a
    // pause-triggered reconnect) last touched the connection.
    setPausedLiveSession(false);
    setPriorConnectedSeconds(0);
    if (detectionPaused) {
      setDetectionPaused(false);
      detectionPausedRef.current = false;
    }
    setServiceStatusAction(service.id, "live").catch(() => {});
    live.start();
  }

  function stopLiveSession() {
    // A real Stop always wins over pause — otherwise a later un-pause could
    // try to reconnect a session the operator deliberately ended.
    setPausedLiveSession(false);
    if (detectionPaused) {
      setDetectionPaused(false);
      detectionPausedRef.current = false;
    }
    live.stop();
    setServiceStatusAction(service.id, "ended").catch(() => {});
  }

  const isLiveActive =
    live.state === "requesting-mic" || live.state === "connecting" || live.state === "listening" || live.state === "reconnecting";
  const isMockActive = sessionState === "running";
  const isSessionIdle = !isLiveActive && !isMockActive && sessionState === "idle";
  // Live session is stopped specifically because of pause, not because the
  // operator ended it — swaps the normal Start/Stop button and status line
  // for a clearer "mic's actually off" indicator (see the header below).
  const isPausedMicOff = detectionPaused && pausedLiveSession;
  const liveButtonLabel =
    live.state === "error" ? "Retry live session" : live.state === "stopped" ? "Restart live session" : "Start live session";
  const displayedChunkText = isMockActive ? currentChunkText : isLiveActive ? live.partialText || null : null;
  // Accumulated across pause/resume cycles — see priorConnectedSeconds' doc
  // comment — so this reflects total connected time for the whole live
  // session, not just time since the last resume.
  const totalConnectedSeconds = priorConnectedSeconds + live.connectedSeconds;
  const approxCost = ((totalConnectedSeconds / 60) * 0.01).toFixed(2);
  const aiCollapsed = entries.length === 0;

  return (
    <div className="bg-background flex h-screen flex-col">
      <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-text-secondary hover:text-text-primary flex items-center gap-1 text-xs">
            <IconArrowLeft size={14} stroke={1.75} aria-hidden="true" />
            Dashboard
          </Link>
          <h1 className="text-text-primary text-lg font-semibold">{service.title}</h1>

          <div className="border-border flex items-center gap-1 rounded-lg border p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => switchMode("prep")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                mode === "prep" ? "bg-accent-gold text-accent-gold-ink" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <IconClipboardList size={14} stroke={1.75} aria-hidden="true" />
              Prep
            </button>
            <button
              type="button"
              onClick={() => switchMode("live")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${
                mode === "live" ? "bg-accent-gold text-accent-gold-ink" : "text-text-secondary hover:text-text-primary"
              }`}
            >
              <IconPlayerPlay size={14} stroke={1.75} aria-hidden="true" />
              Live
            </button>
          </div>
        </div>

        {mode === "live" && (
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-text-secondary flex items-center gap-1.5 text-xs font-medium">
              Translation
              <select
                value={displayTranslation}
                onChange={(e) => changeDisplayTranslation(e.target.value)}
                className="border-border bg-background text-text-primary focus:border-accent-gold focus:ring-accent-gold rounded-lg border px-2 py-1 focus:ring-1 focus:outline-none"
              >
                {BIBLE_TRANSLATIONS.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code}
                  </option>
                ))}
              </select>
            </label>
            <div className="border-border flex items-center gap-1 rounded-lg border p-0.5 text-xs font-medium">
              <button
                type="button"
                disabled={!isSessionIdle}
                onClick={() => changeDisplayMode("auto")}
                title="High-confidence matches display automatically"
                className={`rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  displayMode === "auto" ? "bg-accent-gold text-accent-gold-ink" : "text-text-secondary hover:text-text-primary"
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
                  displayMode === "manual" ? "bg-accent-gold text-accent-gold-ink" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                Manual
              </button>
            </div>
            {/* Separate from Auto/Manual above — that governs what happens
                to a match once found; this governs whether detection runs
                at all. Toggleable any time, unlike Auto/Manual's idle-only
                lock. Bold/filled/pulsing when paused on purpose — per the
                spec this must not be a subtle toggle a busy operator could
                lose track of. */}
            <button
              type="button"
              onClick={toggleDetectionPaused}
              title={
                detectionPaused
                  ? "Resume — reconnects the mic and live transcription"
                  : "Pause AI detection — disconnects the mic and live transcription entirely, so nothing is billed while paused"
              }
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                detectionPaused
                  ? "border-danger bg-danger/15 text-danger animate-pulse"
                  : "border-border text-text-secondary hover:text-text-primary"
              }`}
            >
              {detectionPaused ? (
                <>
                  <IconPlayerPlay size={14} stroke={2} aria-hidden="true" />
                  Detection paused — tap to resume
                </>
              ) : (
                <>
                  <IconPlayerPause size={14} stroke={1.75} aria-hidden="true" />
                  Pause detection
                </>
              )}
            </button>
            <Link
              href={`/stage/${service.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-text-primary hover:bg-background rounded-lg border px-3 py-1.5 text-xs font-medium"
            >
              Stage output ↗
            </Link>
            <Link
              href={`/monitor/${service.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border text-text-primary hover:bg-background rounded-lg border px-3 py-1.5 text-xs font-medium"
            >
              Confidence monitor ↗
            </Link>
            {isPausedMicOff && (
              <span className="text-danger flex items-center gap-1.5 text-xs font-semibold">
                <IconPlayerPause size={12} stroke={2} aria-hidden="true" />
                Mic off — not connected, not billing
              </span>
            )}
            {live.state === "listening" && (
              <span className="text-text-secondary flex items-center gap-1.5 text-xs">
                <span className="bg-accent-gold h-1.5 w-1.5 animate-pulse rounded-full" />
                Listening · {formatDuration(totalConnectedSeconds)}
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
              <span className="text-text-secondary text-xs">
                {live.state === "requesting-mic" ? "Requesting microphone…" : "Connecting…"}
              </span>
            )}
            {live.state === "error" && live.error && <span className="text-danger text-xs font-medium">{live.error}</span>}
            {isMockActive && (
              <span className="text-text-secondary flex items-center gap-1.5 text-xs">
                <span className="bg-accent-gold h-1.5 w-1.5 animate-pulse rounded-full" />
                Mock demo running…
              </span>
            )}

            {/* While paused-and-disconnected, the Pause button above is the
                only control that makes sense here — showing "Restart live
                session" too would offer a second, confusing path back in
                that bypasses the pause/cost accounting above. */}
            {!isPausedMicOff && (
              <>
                {isLiveActive ? (
                  <button
                    type="button"
                    onClick={stopLiveSession}
                    className="border-danger text-danger hover:bg-danger/10 rounded-lg border px-3 py-1.5 text-xs font-medium"
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startLiveSession}
                    disabled={isMockActive}
                    className="bg-accent-gold text-accent-gold-ink rounded-lg px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {liveButtonLabel}
                  </button>
                )}

                {!isLiveActive &&
                  (isMockActive ? (
                    <button type="button" onClick={stopMockSession} className="text-text-secondary hover:text-text-primary text-xs font-medium underline">
                      Stop demo
                    </button>
                  ) : (
                    <button type="button" onClick={startMockSession} className="text-text-secondary hover:text-text-primary text-xs underline">
                      or run mock demo
                    </button>
                  ))}
              </>
            )}
          </div>
        )}
      </div>

      {mode === "prep" ? (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6">
            {!editable && (
              <p className="border-border bg-surface text-text-secondary mb-4 rounded-lg border px-4 py-2 text-xs">
                Viewing as <strong className="text-text-primary">{role}</strong> — only operators and admins can edit the outline.
              </p>
            )}
            <OrderOfServicePanel
              serviceId={service.id}
              cueItems={cueItems}
              mode="prep"
              editable={editable}
              translation={defaultTranslation}
              librarySongs={librarySongs}
              libraryAnnouncements={libraryAnnouncements}
              libraryCustomTexts={libraryCustomTexts}
              activeCueId={activeCueId}
              onSelectLive={() => {}}
              onOutlineRefresh={refreshOutline}
              onReorderOptimistic={reorderOptimistic}
            />
          </div>
        </div>
      ) : (
        <div
          className="service-live-grid divide-border grid flex-1 grid-cols-1 divide-y overflow-hidden lg:divide-y-0"
        >
          <style>{`
            @media (min-width: 1024px) {
              .service-live-grid {
                grid-template-columns: ${quickInsertWidth}px 6px 1fr 6px ${aiCollapsed ? "56px" : `${aiDetectedWidth}px`};
              }
            }
          `}</style>

          {/* Column 1 — Quick Insert (swapped with Order of Service, which
              now lives in column 3 below Live Output). Every panel's width/
              height below is user-resizable via the drag handles between
              them (grip-dot bars) — dragged sizes persist across reloads,
              see loadPanelSizes/savePanelSize above. */}
          <div className="overflow-hidden">
            <QuickInsertPanel librarySongs={librarySongs} onPush={pushQuickLive} translation={displayTranslation} />
          </div>

          <div
            onMouseDown={createResizeHandler({
              axis: "x",
              value: quickInsertWidth,
              setValue: setQuickInsertWidth,
              range: QUICK_INSERT_WIDTH_RANGE,
              field: "quickInsertWidth",
            })}
            className={RESIZE_HANDLE_X_CLASS}
            title="Drag to resize Quick Insert"
          >
            <IconGripVertical size={12} className="text-text-secondary/50" aria-hidden="true" />
          </div>

          {/* Column 3 — Live Output stacked above Order of Service, split by
              its own drag handle. Live Output's height is user-controlled
              (not squeezed by Order of Service's list length): its own
              internal scroll absorbs anything beyond whatever height it's
              been given, so a long list below it can never resize it. */}
          <div className="flex h-full flex-col overflow-hidden">
            <div className="shrink-0 overflow-hidden" style={{ height: liveOutputHeight }}>
              <LiveOutputPane
                current={current}
                next={nextCue}
                onNavigateVerse={navigateVerse}
                navPending={navPending}
                onPanic={pushPanicMode}
                operatorMessage={operatorMessage}
                onOperatorMessageChange={setOperatorMessage}
                onSendOperatorMessage={sendOperatorMessage}
                onClearOperatorMessage={clearOperatorMessage}
              />
            </div>
            <div
              onMouseDown={createResizeHandler({
                axis: "y",
                value: liveOutputHeight,
                setValue: setLiveOutputHeight,
                range: LIVE_OUTPUT_HEIGHT_RANGE,
                field: "liveOutputHeight",
              })}
              className={RESIZE_HANDLE_Y_CLASS}
              title="Drag to resize Live Output"
            >
              <IconGripHorizontal size={12} className="text-text-secondary/50" aria-hidden="true" />
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <OrderOfServicePanel
                serviceId={service.id}
                cueItems={cueItems}
                mode="live"
                editable={editable}
                translation={defaultTranslation}
                librarySongs={librarySongs}
                libraryAnnouncements={libraryAnnouncements}
                libraryCustomTexts={libraryCustomTexts}
                activeCueId={activeCueId}
                onSelectLive={pushCueLive}
                onOutlineRefresh={refreshOutline}
                onReorderOptimistic={reorderOptimistic}
              />
            </div>
          </div>

          {/* Always rendered (never conditionally removed) so the grid keeps
              exactly 5 items matching the 5-column template above — dropping
              this when AI Detected auto-collapses would shift every column
              after it by one track. Just non-interactive and unstyled while
              collapsed, since there's nothing to resize into yet. */}
          <div
            onMouseDown={
              aiCollapsed
                ? undefined
                : createResizeHandler({
                    axis: "x",
                    value: aiDetectedWidth,
                    setValue: setAiDetectedWidth,
                    range: AI_DETECTED_WIDTH_RANGE,
                    invert: true,
                    field: "aiDetectedWidth",
                  })
            }
            className={aiCollapsed ? "hidden lg:block" : RESIZE_HANDLE_X_CLASS}
            title={aiCollapsed ? undefined : "Drag to resize AI Detected"}
          >
            {!aiCollapsed && <IconGripVertical size={12} className="text-text-secondary/50" aria-hidden="true" />}
          </div>

          <div className="overflow-hidden">
            <AiDetectedPane
              entries={entries}
              currentChunkText={displayedChunkText}
              onSelect={selectEntry}
              onDismiss={dismissEntry}
              collapsed={aiCollapsed}
              detectionPaused={detectionPaused}
            />
          </div>
        </div>
      )}
    </div>
  );
}
