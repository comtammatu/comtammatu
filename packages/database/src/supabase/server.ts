import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "../index";

/**
 * Server Supabase client — for RSC and Server Actions.
 * Import: `import { createClient } from "@comtammatu/database/supabase/server"`
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    },
  );
}
