import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Browser-side client. Uses @supabase/ssr (not plain @supabase/supabase-js)
// so the session is stored in cookies rather than localStorage — required
// for it to stay in sync with the server-rendered session (see server.ts
// and ../../proxy.ts).
export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill them in.",
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
