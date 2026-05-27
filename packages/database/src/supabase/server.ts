import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "../index";
import { getSupabaseUrl, getSupabaseAnonKey } from "./_env";

/**
 * Server Supabase client — for RSC and Server Actions.
 * Import: `import { createClient } from "@comtammatu/database/supabase/server"`
 *
 * Wrapped in React `cache()` so repeated calls within ONE RSC render share a
 * single client instance. Safe because `cookies()` from `next/headers` is
 * itself request-scoped — the cookieStore captured on the first call is the
 * same one any later caller would receive. Server Actions run in a separate
 * render scope, so each Action gets a fresh client. Never wrap downstream
 * callers that depend on a live `getUser()` HTTP check (banned-user revoke).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // setAll can fail in RSC (read-only). Safe to ignore.
        }
      },
    },
  });
});
