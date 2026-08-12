/** Normalize source text for static contract regexes under Windows CRLF checkouts. */
export function normalizeEol(source: string): string {
  return source.replace(/\r\n/g, "\n");
}

/** Normalize path separators before allowlist / relative-path compares. */
export function toPosixPath(path: string): string {
  return path.replaceAll("\\", "/");
}
