type E2EEnvironment = {
  E2E_BASE_URL?: string;
  E2E_OWNER_EMAIL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);
const DEFAULT_E2E_BASE_URL = "http://localhost:3000";
const DEFAULT_E2E_OWNER_EMAIL = "keeper@comtammatu.vn";

function requireLoopbackUrl(label: string, value: string | undefined): URL {
  if (!value) {
    throw new Error(`${label} must be configured for isolated E2E execution.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !LOOPBACK_HOSTS.has(parsed.hostname)
  ) {
    throw new Error(`${label} must target a loopback host.`);
  }

  return parsed;
}

export function requireIsolatedE2EEnvironment(
  env: E2EEnvironment = process.env,
) {
  return {
    supabaseUrl: requireLoopbackUrl(
      "NEXT_PUBLIC_SUPABASE_URL",
      env.NEXT_PUBLIC_SUPABASE_URL,
    ).toString(),
    baseUrl: requireLoopbackUrl(
      "E2E_BASE_URL",
      env.E2E_BASE_URL ?? DEFAULT_E2E_BASE_URL,
    ).toString(),
  };
}

export function resolveConfiguredOwnerEmail(
  env: E2EEnvironment = process.env,
): string {
  return env.E2E_OWNER_EMAIL?.trim() || DEFAULT_E2E_OWNER_EMAIL;
}
