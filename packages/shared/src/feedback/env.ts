/**
 * Feedback module env-var resolvers with hardcoded fallbacks.
 *
 * MVP deploy without platform env vars set yet. Each resolver returns the
 * platform env value if present, else falls back to the committed value.
 *
 * ROTATION: when ready, set the env var on the deploy platform AND replace
 * the fallback string here, then redeploy.
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
  const raw =
    process.env["ALLOWED_ORIGINS_FEEDBACK"] ||
    FALLBACK_ALLOWED_ORIGINS_FEEDBACK;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
