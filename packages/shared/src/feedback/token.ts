import { TOKEN_LENGTH, TOKEN_ALPHABET } from "./constants";

/**
 * Generate URL-safe random token for QR codes.
 * Uses crypto.getRandomValues — NOT predictable.
 * 14 chars × 62 alphabet = ~83 bits entropy (safe against brute force).
 */
export function generateFeedbackToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    result += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length];
  }
  return result;
}

export function isValidFeedbackToken(token: string): boolean {
  if (token.length !== TOKEN_LENGTH) return false;
  for (const c of token) {
    if (!TOKEN_ALPHABET.includes(c)) return false;
  }
  return true;
}
