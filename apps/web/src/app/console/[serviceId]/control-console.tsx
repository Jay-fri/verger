"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { runMockDetectionChunkAction, setServiceStatusAction } from "@/lib/services/detection";
import type { VerseSearchResult } from "@/lib/services/search";
import { CueListPane } from "./cue-list-pane";
import { LiveOutputPane } from "./live-output-pane";
import { AiDetectedPane } from "./ai-detected-pane";
import type { CueItem, DetectedEntry, LiveItem } from "./types";

const CHUNK_DELAY_MS = 2500;
const TOTAL_MOCK_CHUNKS = 10;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Service = { id: string; title: string; status: string };

export function ControlConsole({
  service,
  cueItems,
  role,
}: {
  service: Service;
  cueItems: CueItem[];
  role: string;
}) {
  const [activeCueId, setActiveCueId] = useState<string | null>(null);
  const [current, setCurrent] = useState<LiveItem | null>(null);
  const [entries, setEntries] = useState<DetectedEntry[]>([]);
  const [sessionState, setSessionState] = useState<"idle" | "running" | "finished">("idle");
  const [currentChunkText, setCurrentChunkText] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const activeCueIndex = activeCueId ? cueItems.findIndex((c) => c.id === activeCueId) : -1;
  const nextCue = activeCueIndex >= 0 ? (cueItems[activeCueIndex + 1] ?? null) : (cueItems[0] ?? null);

  function pushCueLive(item: CueItem) {
    setActiveCueId(item.id);
    setCurrent({
      source: "cue",
      book: item.book,
      chapter: item.chapter,
      verse: item.verse,
      label: item.label,
      text: item.text,
    });
  }

  function pushSearchResultLive(verse: VerseSearchResult) {
    setCurrent({ source: "search", ...verse });
  }

  function confirmEntry(entryId: string) {
    setEntries((prev) => {
      const entry = prev.find((e) => e.id === entryId);
      if (!entry) return prev;
      setCurrent({
        source: "detection",
        book: entry.book,
        chapter: entry.chapter,
        verse: entry.verse,
        label: entry.label,
        text: entry.text,
      });
      return prev.map((e) => (e.id === entryId ? { ...e, status: "confirmed" } : e));
    });
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
          setCurrent({
            source: "detection",
            book: match.book,
            chapter: match.chapter,
            verse: match.verse,
            label: match.label,
            text: match.text,
          });
          setEntries((prev) => [
            {
              id: entryId,
              status: "confident",
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
          <LiveOutputPane current={current} next={nextCue} />
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
