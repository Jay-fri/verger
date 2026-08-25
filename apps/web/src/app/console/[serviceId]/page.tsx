import { redirect } from "next/navigation";

// Prep and the Control console are now one merged "Service" screen — see
// app/service/[serviceId]. Kept as a redirect (not deleted) so any existing
// bookmarks/links to the old Control console URL still land somewhere useful.
export default async function LegacyConsoleRedirect({
  params,
}: {
  params: Promise<{ serviceId: string }>;
}) {
  const { serviceId } = await params;
  redirect(`/service/${serviceId}?mode=live`);
}
