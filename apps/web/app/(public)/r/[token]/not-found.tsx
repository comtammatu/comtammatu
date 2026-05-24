import { TokenInvalidView } from "./_components/token-invalid-view";

/**
 * Renders when `notFound()` is called from page.tsx (e.g. token is invalid
 * shape or has been deactivated). Next.js returns HTTP 404 — semantically
 * close to RFC 7231 410 Gone (App Router has no first-class 410 hook).
 */
export default function NotFound() {
  return <TokenInvalidView />;
}
