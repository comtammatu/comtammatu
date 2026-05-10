/**
 * Feedback module env-var resolvers with development fallbacks.
 *
 * Public feedback POSTs are cross-origin sensitive. Production must configure
 * ALLOWED_ORIGINS_FEEDBACK explicitly; otherwise the submit action fails closed.
 */

const FALLBACK_TELEGRAM_BOT_TOKEN =
  "8725750731:AAER5kPLzfw5wJVLcORYbz5GzGXGGLsPXos";
const FALLBACK_CRON_SECRET =
  "01495eb80840df20539e3017d828e850d627bdaec28708df6815f1da2f25d052";
const FALLBACK_IP_HASH_SALT =
  "a83c52f2fa262ce4366f079ff4207c116219d42ce00d518c0478f6a18202eba6";
const FALLBACK_APP_URL = "https://comtammatu-web-comtammatu.vercel.app";
const FALLBACK_ALLOWED_ORIGINS_FEEDBACK =
  "https://comtammatu-web-comtammatu.vercel.app";

function parseCsv(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProductionRuntime(): boolean {
  return (
    process.env["NODE_ENV"] === "production"
    || process.env["VERCEL_ENV"] === "production"
  );
}

export function getTelegramBotToken(): string {
  return process.env["TELEGRAM_BOT_TOKEN"] || FALLBACK_TELEGRAM_BOT_TOKEN;
}

export function getCronSecret(): string {
  return process.env["CRON_SECRET"] || FALLBACK_CRON_SECRET;
}

export function getIpHashSalt(): string {
  return process.env["IP_HASH_SALT"] || FALLBACK_IP_HASH_SALT;
}

export function getAppUrl(): string {
  return process.env["NEXT_PUBLIC_APP_URL"] || FALLBACK_APP_URL;
}

export function getAllowedOriginsFeedback(): string[] {
  const configured = parseCsv(process.env["ALLOWED_ORIGINS_FEEDBACK"]);
  if (configured.length > 0) {
    return configured;
  }

  if (isProductionRuntime()) {
    return [];
  }

  return parseCsv(FALLBACK_ALLOWED_ORIGINS_FEEDBACK);
}
