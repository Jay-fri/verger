const DEFAULT_NEXT = "/dashboard";

// `next` round-trips through query params and hidden form fields, so it's
// attacker-controlled input. Only allow same-origin relative paths — reject
// anything that could act as an open redirect (protocol-relative "//evil.com",
// absolute URLs, etc.).
export function safeNextPath(value: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== "string" || value.length === 0) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://")) return fallback;
  return value;
}
