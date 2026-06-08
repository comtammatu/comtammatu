/**
 * Cron env-var resolvers. FAIL-CLOSED: throw when the required secret is
 * missing instead of substituting a committed fallback.
 *
 * `getCronSecret` gates the mandatory HĐĐT crons + KDS maintenance. Set
 * CRON_SECRET on the deploy platform.
 */

export function getCronSecret(): string {
  const value = process.env["CRON_SECRET"];
  if (!value) {
    throw new Error(
      "Missing required env var CRON_SECRET. Set it on the deploy platform.",
    );
  }
  return value;
}
