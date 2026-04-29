/**
 * Credential-stripping utility for audit_logs entries.
 *
 * Walks an arbitrary JSON-shaped value and replaces any property whose key
 * matches a known secret name with the literal string `[REDACTED]`. Used
 * before passing `oldData` / `newData` to the `log_audit()` RPC for any
 * provider-config or credential mutation.
 *
 * Enforces the AUDIT-NEVER-LOG-CREDENTIALS regression rule.
 *
 * Match semantics: case-insensitive, exact key name (with and without
 * common separators). Substring matches are intentionally avoided to keep
 * the rule surgical — `partnerCode` is NOT treated as a secret because
 * it's the merchant identifier, not the secret key.
 *
 * Refs: docs/plan/m4-payments-fix.md (P0-2 webhook hardening + audit posture).
 */

const SECRET_KEYS: ReadonlySet<string> = new Set([
  "credentials",
  "apikey",
  "api_key",
  "accesskey",
  "access_key",
  "secretkey",
  "secret_key",
  "privatekey",
  "private_key",
  "password",
  "passcode",
  "token",
  "webhooksecret",
  "webhook_secret",
  "signingkey",
  "signing_key",
]);

const REDACTED = "[REDACTED]" as const;

export function redactCredentials<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactCredentials(v)) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) {
      result[key] = REDACTED;
    } else {
      result[key] = redactCredentials(val);
    }
  }
  return result as unknown as T;
}
