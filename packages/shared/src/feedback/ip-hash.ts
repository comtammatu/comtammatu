/**
 * Hash submitter IP with rotating salt for spam detection without storing PII.
 * Uses Web Crypto API (SHA-256). Returns hex digest.
 *
 * WHY: storing raw IPs is a GDPR concern; hashing with a rotating daily salt
 * lets us detect bursts without long-term PII retention.
 */
export async function hashIp(ip: string, salt: string): Promise<string> {
  if (!ip || !salt) throw new Error("ip_hash_inputs_required");
  const data = new TextEncoder().encode(ip + ":" + salt);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
