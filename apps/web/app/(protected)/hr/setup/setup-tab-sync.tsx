"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PageSpinner } from "@/components/page-skeleton";

export type SetupTab = "leave" | "shifts" | "tasks";

function resolveClientTab(value: string | null): SetupTab {
  if (value === "shifts" || value === "tasks" || value === "leave") {
    return value;
  }
  return "leave";
}

/**
 * Soft-nav updates `?tab=` before the server-dispatched panel arrives.
 * Show a spinner instead of a blank TabsContent or a stale panel.
 */
export function SetupTabSync({
  serverTab,
  children,
}: {
  serverTab: SetupTab;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const liveTab = resolveClientTab(searchParams.get("tab"));

  if (liveTab !== serverTab) {
    return <PageSpinner />;
  }

  return children;
}
