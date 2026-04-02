import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in Server Actions for admin operations (e.g., creating auth users).
 * NEVER import in "use client" components or expose to the browser.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}
