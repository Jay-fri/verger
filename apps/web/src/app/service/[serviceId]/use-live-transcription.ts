"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mintAssemblyAiTokenAction } from "@/lib/services/transcription";

const STREAM_SAMPLE_RATE = 16000;
const WORKLET_URL = "/audio/pcm-worklet.js";
const WORKLET_NAME = "pcm-recorder-processor";
// A few retries with backoff — enough to ride out a real network blip
// mid-service without the operator having to do anything, but bounded so a
// truly dead connection (or a misconfigured API key) surfaces as a visible
// error instead of retrying forever.
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 30000];
const APPROX_COST_PER_MINUTE_USD = 0.01;
// Waiting for AssemblyAI's end_of_turn is real, avoidable latency — a turn
// only finalizes at a natural pause, and reading a whole verse aloud easily
// takes several seconds. So partial (interim) transcripts get checked too,
// not just finals — a match can go live as soon as it's recognizable
// instead of waiting for endpointing. Throttled to this interval so a
// fast-growing partial doesn't spam the detection pipeline; findAllReferences'
// isWholeChapter gate (routes a bare chapter mention to needs-review, never
// auto-display) is what keeps an incomplete "...chapter 3..." partial from
// ever flashing a guessed verse live before the real verse number arrives.
const PARTIAL_CHECK_INTERVAL_MS = 1500;
const PARTIAL_CHECK_MIN_CHARS = 12;
// Each worklet message is ~100ms of audio (see pcm-worklet.js) — 150 frames
// is ~15s, comfortably more than the connect handshake ever takes, while
// still bounding memory if a reconnect backoff runs long.
const MAX_BUFFERED_AUDIO_FRAMES = 150;
// How often to log the running audio-frame-flow counters — see
// audioFrameStatsRef below. This is diagnostic-only (real finding from a
// piloting session: a "frozen partial" bug report was ambiguous between
// "AssemblyAI stopped sending new content" and "our own audio pipeline
// stopped producing frames" until these counters existed to tell the two
// apart from the logs alone).
const AUDIO_FLOW_LOG_INTERVAL_MS = 5000;

export type LiveSessionState =
  | "idle"
  | "requesting-mic"
  | "connecting"
  | "listening"
  | "reconnecting"
  | "error"
  | "stopped";

type TurnMessage = {
  type: "Turn";
  transcript?: string;
  end_of_turn?: boolean;
};

type BeginMessage = { type: "Begin" };

type TerminationMessage = {
  type: "Termination";
  audio_duration_seconds?: number;
  session_duration_seconds?: number;
};

/**
 * Owns the whole live-transcription session lifecycle: mic capture over a
 * PCM AudioWorklet, the AssemblyAI streaming WebSocket, and reconnection —
 * so control-console.tsx just gets finalized transcript turns and a status
 * to render. See apps/web/public/audio/pcm-worklet.js for the mic side and
 * src/lib/services/transcription.ts for the server-side token minting.
 */
export function useLiveTranscription({
  serviceId,
  onFinalTranscript,
  onPartialTranscript,
}: {
  serviceId: string;
  onFinalTranscript: (text: string) => void;
  /**
   * Fires periodically (throttled — see PARTIAL_CHECK_INTERVAL_MS) with the
   * current partial transcript while a turn is still growing, so a match
   * can be checked for before AssemblyAI finalizes the turn. Optional:
   * callers that only care about finalized turns can omit it.
   */
  onPartialTranscript?: (text: string) => void;
}) {
  const [state, setState] = useState<LiveSessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partialText, setPartialText] = useState("");
  const [connectedSeconds, setConnectedSeconds] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const stoppingRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const loggedMinuteRef = useRef(0);
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onPartialTranscriptRef = useRef(onPartialTranscript);
  const connectRef = useRef<() => Promise<void>>(async () => {});
  // Real finding from live testing: mic capture starts (and the operator's
  // audio starts flowing) before the WebSocket finishes connecting — token
  // minting + the connection handshake took ~5s in testing. Frames captured
  // during that window (or during a reconnect gap later) used to be silently
  // dropped, meaning whatever the pastor said in the first few seconds after
  // "Start live session" was clicked never reached AssemblyAI at all. Now
  // buffered here and flushed the moment the socket opens instead. Capped so
  // a long reconnect backoff can't buffer unbounded memory — ~15s of audio.
  const pendingAudioRef = useRef<ArrayBuffer[]>([]);
  const keytermsPromptRef = useRef<string[]>([]);
  // Timestamp of the last time this turn's growth was checked (reset at the
  // start of each new turn) — see PARTIAL_CHECK_INTERVAL_MS.
  const turnCheckedAtRef = useRef(0);
  // The text actually handed to onPartialTranscript last time (not just
  // "last time we were due to check") — lets us skip re-running the whole
  // detection pipeline against text that hasn't changed at all. Real finding
  // from a piloting session: AssemblyAI can legitimately re-send the same
  // partial transcript content on more than one Turn message (e.g. while the
  // speaker pauses, or as an interim re-confirmation), and without this
  // guard every one of those re-sends was treated as "new" content and
  // walked through the whole matching pipeline again — burning latency for
  // no reason and, worse, looking indistinguishable in the logs from a truly
  // stuck pipeline. Reset at the start of each new turn alongside
  // turnCheckedAtRef.
  const lastCheckedPartialTextRef = useRef("");
  // Running counters purely for the periodic [audio-flow] log line below —
  // lets a real test session's logs show, second by second, whether the
  // worklet is still producing frames and whether they're still reaching
  // the WebSocket, rather than only inferring pipeline health indirectly
  // from whether transcripts are advancing.
  const audioFrameStatsRef = useRef({ fromWorklet: 0, sentToWs: 0, buffered: 0, lastLoggedAt: 0 });
  // Monotonic counter tagging every raw AssemblyAI message as received, so
  // the [assemblyai:raw] log lines below can be correlated 1:1 with
  // whatever processed [assemblyai] log line follows — see ws.onmessage.
  const rawMessageSeqRef = useRef(0);

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
    onPartialTranscriptRef.current = onPartialTranscript;
  }, [onFinalTranscript, onPartialTranscript]);

  const stopUsageTimer = useCallback(() => {
    if (usageTimerRef.current) {
      clearInterval(usageTimerRef.current);
      usageTimerRef.current = null;
    }
  }, []);

  const startUsageTimer = useCallback(() => {
    stopUsageTimer();
    usageTimerRef.current = setInterval(() => {
      setConnectedSeconds((s) => {
        const next = s + 1;
        const minute = Math.floor(next / 60);
        if (minute > loggedMinuteRef.current) {
          loggedMinuteRef.current = minute;
          const cost = (minute * APPROX_COST_PER_MINUTE_USD).toFixed(2);
          console.info(`[assemblyai] ~${minute} min streamed so far (~$${cost})`);
        }
        return next;
      });
    }, 1000);
  }, [stopUsageTimer]);

  const teardownAudio = useCallback(() => {
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
  }, []);

  // Declared before connect() (which schedules a reconnect on failure) so
  // that reference doesn't need a forward declaration — scheduleReconnect
  // itself only needs connect indirectly, via connectRef, to break the
  // circularity the other way.
  const scheduleReconnect = useCallback(
    (lastErrorMessage?: string) => {
      if (stoppingRef.current) return;

      if (reconnectAttemptRef.current >= RECONNECT_DELAYS_MS.length) {
        setError(
          lastErrorMessage ??
            "Lost connection to the speech-to-text service and couldn't reconnect. Stop and start again.",
        );
        setState("error");
        teardownAudio();
        return;
      }

      const delay = RECONNECT_DELAYS_MS[reconnectAttemptRef.current];
      reconnectAttemptRef.current += 1;
      setReconnectAttempt(reconnectAttemptRef.current);
      setState("reconnecting");
      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current();
      }, delay);
    },
    [teardownAudio],
  );

  const connect = useCallback(async () => {
    let token: string;
    try {
      const result = await mintAssemblyAiTokenAction(serviceId);
      token = result.token;
      keytermsPromptRef.current = result.keytermsPrompt;
    } catch (err) {
      if (stoppingRef.current) return;
      const message = err instanceof Error ? err.message : "Couldn't reach the speech-to-text service.";
      // A missing/invalid API key is a config problem, not a transient
      // network blip — retrying it 6 times with backoff just delays telling
      // the operator what's actually wrong.
      if (message.includes("not configured")) {
        setError(message);
        setState("error");
        teardownAudio();
        return;
      }
      scheduleReconnect(message);
      return;
    }

    if (stoppingRef.current) return;

    // format_turns: AssemblyAI punctuates/capitalizes finalized turns (and,
    // per its docs, formats numbers) — a second layer of defense on top of
    // the parser's own spoken-number handling, since partials are never
    // formatted regardless. keyterms_prompt: word-boosts transcription
    // toward Bible book names specifically (see transcription.ts).
    const params = new URLSearchParams({
      sample_rate: String(STREAM_SAMPLE_RATE),
      token,
      format_turns: "true",
    });
    if (keytermsPromptRef.current.length > 0) {
      params.set("keyterms_prompt", JSON.stringify(keytermsPromptRef.current));
    }
    const ws = new WebSocket(`wss://streaming.assemblyai.com/v3/ws?${params.toString()}`);
    wsRef.current = ws;

    ws.onopen = () => {
      // Flush whatever mic audio accumulated while the handshake was in
      // flight (or, on a reconnect, while the previous connection was
      // down) — otherwise that stretch of speech is just gone.
      const pending = pendingAudioRef.current;
      pendingAudioRef.current = [];
      if (pending.length > 0) {
        console.info(`[assemblyai] flushing ${pending.length} buffered audio frame(s) captured before the connection opened`);
        for (const frame of pending) {
          ws.send(frame);
        }
      }
    };

    ws.onmessage = (event) => {
      // Logged BEFORE any parsing/state handling, and completely
      // independent of it — this is the raw wire payload exactly as
      // AssemblyAI sent it, tagged with a sequence number and timestamp.
      // The point (see the bug report this responds to): if this log shows
      // 15 distinct payloads with genuinely changing `transcript` text,
      // the stall is in our own handling downstream; if it shows AssemblyAI
      // itself re-sending identical payloads, the stall is upstream. No
      // internal counter or processed-state log can answer that question —
      // only the raw bytes as received can.
      const seq = rawMessageSeqRef.current++;
      console.info(`[assemblyai:raw] #${seq} @${new Date().toISOString()} ${event.data as string}`);

      let msg: BeginMessage | TurnMessage | TerminationMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (msg.type === "Begin") {
        reconnectAttemptRef.current = 0;
        setReconnectAttempt(0);
        setError(null);
        setState("listening");
        startUsageTimer();
        turnCheckedAtRef.current = Date.now();
        return;
      }

      if (msg.type === "Turn") {
        const text = typeof msg.transcript === "string" ? msg.transcript.trim() : "";
        if (msg.end_of_turn) {
          setPartialText("");
          turnCheckedAtRef.current = Date.now(); // fresh countdown for the next turn
          lastCheckedPartialTextRef.current = "";
          if (text) onFinalTranscriptRef.current(text);
        } else {
          setPartialText(text);
          const now = Date.now();
          if (
            text.length >= PARTIAL_CHECK_MIN_CHARS &&
            now - turnCheckedAtRef.current >= PARTIAL_CHECK_INTERVAL_MS
          ) {
            turnCheckedAtRef.current = now;
            // Skip re-running the matching pipeline against text we've
            // already checked and found nothing new in — see
            // lastCheckedPartialTextRef's doc comment. AssemblyAI can (and,
            // per real session logs, does) send more than one Turn message
            // with identical transcript text for the same growing turn.
            if (text !== lastCheckedPartialTextRef.current) {
              lastCheckedPartialTextRef.current = text;
              onPartialTranscriptRef.current?.(text);
            } else {
              console.info(`[assemblyai] partial #${seq} text unchanged since last check — skipping re-detection`);
            }
          }
        }
        return;
      }

      if (msg.type === "Termination") {
        console.info(
          `[assemblyai] connection segment ended — audio ${msg.audio_duration_seconds ?? "?"}s, ` +
            `connection ${msg.session_duration_seconds ?? "?"}s`,
        );
      }
    };

    ws.onclose = () => {
      stopUsageTimer();
      if (stoppingRef.current) {
        setState("stopped");
        return;
      }
      // Any close we didn't ask for (network drop, AssemblyAI-side
      // disconnect, the 3-hour auto-close) is treated as reconnectable —
      // this is exactly the "dropped connection mid-service" case.
      scheduleReconnect();
    };
  }, [serviceId, startUsageTimer, stopUsageTimer, teardownAudio, scheduleReconnect]);

  // Keeps connectRef current so scheduleReconnect's setTimeout callback —
  // declared before connect exists — always calls the latest connect
  // closure without needing connect in its own dependency array.
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const start = useCallback(async () => {
    setError(null);
    stoppingRef.current = false;
    setConnectedSeconds(0);
    loggedMinuteRef.current = 0;
    reconnectAttemptRef.current = 0;
    setReconnectAttempt(0);
    pendingAudioRef.current = [];
    audioFrameStatsRef.current = { fromWorklet: 0, sentToWs: 0, buffered: 0, lastLoggedAt: 0 };
    rawMessageSeqRef.current = 0;
    lastCheckedPartialTextRef.current = "";
    setState("requesting-mic");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError("Couldn't access the microphone — check browser permissions and try again.");
      setState("error");
      return;
    }
    mediaStreamRef.current = stream;

    try {
      const audioContext = new AudioContext({ sampleRate: STREAM_SAMPLE_RATE });
      audioContextRef.current = audioContext;
      await audioContext.audioWorklet.addModule(WORKLET_URL);

      const source = audioContext.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(audioContext, WORKLET_NAME);
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const stats = audioFrameStatsRef.current;
        stats.fromWorklet += 1;

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(event.data);
          stats.sentToWs += 1;
        } else {
          // Not connected yet (initial handshake) or not connected right
          // now (mid-reconnect) — buffer instead of dropping, so speech
          // captured during that gap still reaches AssemblyAI once the
          // socket opens. See pendingAudioRef's doc comment.
          pendingAudioRef.current.push(event.data);
          stats.buffered += 1;
          if (pendingAudioRef.current.length > MAX_BUFFERED_AUDIO_FRAMES) {
            pendingAudioRef.current.shift();
          }
        }

        // Periodic proof-of-life for the capture side of the pipeline —
        // if this stops incrementing while the session is still "listening",
        // the worklet itself has stopped producing frames (a capture-side
        // stall); if fromWorklet keeps climbing but sentToWs doesn't, frames
        // are being produced but not reaching AssemblyAI (a send-side
        // stall). Either way this tells us which side of the wire a "frozen
        // partial" report is actually on, independent of the raw
        // AssemblyAI message log above.
        const now = Date.now();
        if (now - stats.lastLoggedAt >= AUDIO_FLOW_LOG_INTERVAL_MS) {
          stats.lastLoggedAt = now;
          console.info(
            `[audio-flow] frames from worklet=${stats.fromWorklet}, sent to ws=${stats.sentToWs}, ` +
              `buffered (not yet sent)=${stats.buffered}, currently pending=${pendingAudioRef.current.length}`,
          );
        }
      };
      // Chrome's Web Audio graph is pull-based, driven from the
      // AudioContext's destination outward — a node with no path to
      // destination has, per real-world reports and our own piloting
      // symptoms, no reliable guarantee it keeps being pulled for
      // processing, especially once a tab backgrounds. Routing through a
      // zero-gain node keeps this worklet on a path to destination (so it
      // stays part of the actively-pulled graph) without adding the mic's
      // own audio to whatever the page plays — gain 0 means silence, not a
      // feedback loop.
      const silentSink = audioContext.createGain();
      silentSink.gain.value = 0;
      source.connect(worklet);
      worklet.connect(silentSink);
      silentSink.connect(audioContext.destination);
      workletNodeRef.current = worklet;
    } catch {
      setError("Couldn't set up audio capture in this browser.");
      setState("error");
      teardownAudio();
      return;
    }

    setState("connecting");
    await connect();
  }, [connect, teardownAudio]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    stopUsageTimer();

    const ws = wsRef.current;
    wsRef.current = null;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Let AssemblyAI finalize the open turn before we hang up — see
      // https://www.assemblyai.com/docs/streaming/universal-streaming.
      try {
        ws.send(JSON.stringify({ type: "Terminate" }));
      } catch {
        // ignore — closing below either way
      }
      setTimeout(() => ws.close(), 1500);
    } else {
      ws?.close();
    }

    teardownAudio();
    pendingAudioRef.current = [];
    setPartialText("");
    setState("stopped");
  }, [stopUsageTimer, teardownAudio]);

  // Belt-and-suspenders cleanup if the console unmounts mid-session
  // (navigating away) without the operator clicking Stop first.
  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      stopUsageTimer();
      wsRef.current?.close();
      teardownAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { state, error, partialText, connectedSeconds, reconnectAttempt, start, stop };
}
