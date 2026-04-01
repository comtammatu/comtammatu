import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../types/database.types";

/**
 * Browser Supabase client — for "use client" components.
 * Import: `import { createClient } from "@comtammatu/database/supabase/client"`
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
