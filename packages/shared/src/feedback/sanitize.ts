import { COMMENT_MIN_LENGTH, COMMENT_MAX_LENGTH } from "./constants";

/**
 * Strip HTML tags and control characters from feedback comments.
 * Preserves Vietnamese diacritics and emoji.
 * Output length is checked against COMMENT_MIN_LENGTH/MAX.
 */
export function sanitizeComment(input: string): string {
  // Strip <...> tags greedily, remove ASCII control chars (except tab/newline), trim.
  // Control-char regex is intentional — eslint flags it but we want exactly this.
  // eslint-disable-next-line no-control-regex
  const controlChars = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
  const stripped = input
    .replace(/<[^>]*>/g, "")
    .replace(controlChars, "")
    .trim();
  return stripped;
}

export function isCommentLengthValid(sanitized: string): boolean {
  return (
    sanitized.length >= COMMENT_MIN_LENGTH &&
    sanitized.length <= COMMENT_MAX_LENGTH
  );
}
