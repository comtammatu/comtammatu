import { PHONE_REGEX } from "./constants";

/**
 * Normalize Vietnamese & international phone numbers to E.164-ish.
 *  - "0901234567"      → "+84901234567"
 *  - "84901234567"     → "+84901234567"
 *  - "+84901234567"    → "+84901234567"
 *  - "+1 415 555 1234" → "+14155551234"
 *
 * Returns null if input is empty/invalid (caller decides whether NULL is OK).
 */
export function normalizePhone(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  // Strip spaces, dashes, dots to handle formatted numbers
  const trimmed = input.trim().replace(/[\s\-.]/g, "");
  if (trimmed.length === 0) return null;
  let candidate: string;
  if (trimmed.startsWith("+")) candidate = trimmed;
  else if (trimmed.startsWith("0")) candidate = "+84" + trimmed.slice(1);
  else if (trimmed.startsWith("84")) candidate = "+" + trimmed;
  else candidate = "+84" + trimmed;
  if (!PHONE_REGEX.test(candidate)) return null;
  return candidate;
}
