/**
 * Core Supabase env-var resolvers with hardcoded fallbacks.
 *
 * Same MVP-deploy rationale as packages/shared/src/feedback/env.ts:
 * fall back to actual production values when platform env vars are missing,
 * so the app builds and runs even without Vercel env config.
 *
 * ROTATION: rotate Supabase keys via dashboard, then update fallbacks here
 * AND on platform env vars, then redeploy.
 */

const FALLBACK_URL = "https://ujpzszswneqjhtymrvyu.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcHpzenN3bmVxamh0eW1ydnl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5OTgwODIsImV4cCI6MjA5MzU3NDA4Mn0.LL-ZDP6_69q5rdOi_VikG3v7TbtrN6fbTw6U3JfD8wg";
const FALLBACK_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqcHpzenN3bmVxamh0eW1ydnl1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5ODA4MiwiZXhwIjoyMDkzNTc0MDgyfQ.4_PNTV7YlL3NGIMiTAiTyvtlJuxvRXVVRbDqnwCrVes";

export function getSupabaseUrl(): string {
  return process.env["NEXT_PUBLIC_SUPABASE_URL"] || FALLBACK_URL;
}

export function getSupabaseAnonKey(): string {
  return process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] || FALLBACK_ANON_KEY;
}

export function getSupabaseServiceRoleKey(): string {
  return (
    process.env["SUPABASE_SERVICE_ROLE_KEY"] || FALLBACK_SERVICE_ROLE_KEY
  );
}
