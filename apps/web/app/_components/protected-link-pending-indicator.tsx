"use client";

import { useLinkStatus } from "next/link";

export function ProtectedLinkPendingIndicator() {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      data-pending={pending ? "true" : undefined}
      className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary opacity-0 transition-opacity duration-150 data-[pending=true]:animate-pulse data-[pending=true]:opacity-100"
    />
  );
}
