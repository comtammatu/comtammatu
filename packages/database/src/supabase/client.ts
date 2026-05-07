import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "../index";

// Inline fallbacks (NEXT_PUBLIC_* are build-time inlined by Next.js — must use
// literal strings here, not helper imports, so the bundler can substitute
// process.env at compile time and fall through to the literal if env is empty).
const FALLBACK_URL = "https://ujpzszswneqjhtymrvyu.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcHpzenN3bmVxamh0eW1ydnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTgwODIsImV4cCI6MjA5MzU3NDA4Mn0.LL-ZDP6_69q5rdOi_VikG3v7TbtrN6fbTw6U3JfD8wg";

/**
 * Browser Supabase client — for "use client" components.
 * Import: `import { createClient } from "@comtammatu/database/supabase/client"`
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || FALLBACK_ANON_KEY,
  );
}
