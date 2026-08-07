export function getSiteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SITE_URL — copy .env.example to .env.local and fill it in.",
    );
  }
  return url.replace(/\/$/, "");
}
