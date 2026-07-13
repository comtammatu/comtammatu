import { createHash, timingSafeEqual } from "node:crypto";

/** Fail-closed: missing CRON_SECRET env → null → every cron route returns 401. */
export function getCronSecret(): string | null {
  return process.env["CRON_SECRET"] || null;
}

export function timingSafeSecretEquals(
  actual: string,
  expected: string,
): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return (
    timingSafeEqual(actualDigest, expectedDigest) &&
    Buffer.byteLength(actual, "utf8") === Buffer.byteLength(expected, "utf8")
  );
}
