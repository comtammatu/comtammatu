import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../index";

/**
 * Browser Supabase client — for "use client" components.
 *
 * NEXT_PUBLIC_* are build-time inlined by Next.js, so reference them as static
 * literals here (not helper imports) so the bundler can substitute them.
 * FAIL-CLOSED: no committed fallback — a build with empty NEXT_PUBLIC_SUPABASE_*
 * throws at runtime rather than silently binding to a hardcoded project.
 *
 * Import: `import { createClient } from "@comtammatu/database/supabase/client"`
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (build-time public env).",
    );
  }
  return createBrowserClient<Database>(url, anonKey);
}
