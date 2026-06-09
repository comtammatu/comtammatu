import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../index";

function requirePublicEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`Missing required public Supabase env var: ${name}`);
  }

  return trimmed;
}

/**
 * Browser Supabase client — for "use client" components.
 * Import: `import { createClient } from "@comtammatu/database/supabase/client"`
 */
export function createClient() {
  return createBrowserClient<Database>(
    requirePublicEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requirePublicEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  );
}
