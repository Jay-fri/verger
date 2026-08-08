"use server";

import { BOOKS } from "@verger/bible-data";
import { requireServiceAccess } from "./access";

const TOKEN_ENDPOINT = "https://streaming.assemblyai.com/v3/token";
// AssemblyAI streaming tokens are one-time-use — a fresh one is minted for
// every connection attempt (including reconnects), so a short TTL just
// bounds how long an unused token stays valid before the client actually
// opens the WebSocket.
const TOKEN_TTL_SECONDS = 60;

// Word-boosts the transcription model toward Bible book names specifically
// (AssemblyAI's keyterms_prompt) — commonly-mis-heard ones (Philippians,
// Ecclesiastes, Deuteronomy...) otherwise transcribe as near-miss words that
// never reach the reference parser at all. Capped at AssemblyAI's 100-term
// limit; the 66 canonical names fit comfortably. Computed here (server-side)
// rather than in the client hook so the client never needs to import
// @verger/bible-data's barrel — that pulls in the DB-connected embeddings
// path, which broke the client bundle the same way once already (see
// live-state.ts's history).
const BOOK_NAME_KEYTERMS = BOOKS.map((book) => book.name);

export type AssemblyAiToken = { token: string; keytermsPrompt: string[] };

/**
 * Mints a short-lived AssemblyAI streaming token server-side — the real API
 * key must never reach the browser (see
 * https://www.assemblyai.com/docs/streaming/authenticate-with-a-temporary-token).
 * Gated behind requireServiceAccess so a stranger can't burn the church's
 * AssemblyAI quota by hitting this action directly.
 */
export async function mintAssemblyAiTokenAction(serviceId: string): Promise<AssemblyAiToken> {
  await requireServiceAccess(serviceId);

  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error("ASSEMBLYAI_API_KEY is not configured — live transcription is unavailable.");
  }

  const response = await fetch(`${TOKEN_ENDPOINT}?expires_in_seconds=${TOKEN_TTL_SECONDS}`, {
    headers: { Authorization: apiKey },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AssemblyAI token request failed (${response.status}).`);
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error("AssemblyAI token response was missing a token.");
  }
  return { token: data.token, keytermsPrompt: BOOK_NAME_KEYTERMS };
}
