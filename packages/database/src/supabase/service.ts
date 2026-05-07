import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../index";
import { getSupabaseUrl, getSupabaseServiceRoleKey } from "./_env";

/**
 * Service-role Supabase client — bypasses RLS.
 * Use ONLY in Server Actions for admin operations (e.g., creating auth users).
 * NEVER import in "use client" components or expose to the browser.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    getSupabaseUrl(),
    getSupabaseServiceRoleKey(),
  );
}
