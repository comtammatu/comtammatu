const FALLBACK_CRON_SECRET =
  "01495eb80840df20539e3017d828e850d627bdaec28708df6815f1da2f25d052";

export function getCronSecret(): string {
  return process.env["CRON_SECRET"] || FALLBACK_CRON_SECRET;
}
