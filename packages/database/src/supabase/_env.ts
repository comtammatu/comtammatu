/**
 * Core Supabase env-var resolvers. FAIL-CLOSED: throw when a required env var
 * is missing instead of substituting a committed fallback secret.
 *
 * Set these on the deploy platform (Vercel) and in `.env.local` for local dev.
 * Canonical project ref lives in `.env.local` (SUPABASE_PROJECT_ID).
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required env var ${name}. Set it on the deploy platform and in .env.local.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function getSupabaseAnonKey(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}
