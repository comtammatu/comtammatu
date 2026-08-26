import Link from "next/link";
import type { ComponentProps } from "react";

type ProtectedLinkProps = Omit<ComponentProps<typeof Link>, "prefetch">;

/**
 * Authenticated navigation must not speculatively render every visible target.
 * Each prefetch is a separate RSC request, so request-scoped auth memoization
 * cannot collapse the Supabase Auth liveness probe across destination links.
 * The click remains a client navigation and probes once in its real request.
 */
export function ProtectedLink(props: ProtectedLinkProps) {
  return <Link {...props} prefetch={false} />;
}
