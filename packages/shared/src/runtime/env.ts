/** Fail-closed: missing CRON_SECRET env → null → every cron route returns 401. */
export function getCronSecret(): string | null {
  return process.env["CRON_SECRET"] || null;
}

export { resolveTrustedApplicationOrigin } from "./application-origin";
