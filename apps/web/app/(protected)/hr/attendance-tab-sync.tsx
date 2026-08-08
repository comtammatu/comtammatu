"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { PageSpinner } from "@/components/page-skeleton";

export type AttendanceTab = "today" | "approvals" | "timesheet" | "roster";

function resolveClientTab(value: string | null): AttendanceTab {
  if (value === "leave" || value === "schedule") return "approvals";
  if (value === "attendance") return "timesheet";
  if (
    value === "today" ||
    value === "approvals" ||
    value === "timesheet" ||
    value === "roster"
  ) {
    return value;
  }
  return "today";
}

/**
 * While soft-navigating between server-dispatched attendance panels, the URL
 * tab updates before the RSC payload arrives. Show a spinner instead of a
 * blank TabsContent or a stale panel.
 */
export function AttendanceTabSync({
  serverTab,
  children,
}: {
  serverTab: AttendanceTab;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const liveTab = resolveClientTab(searchParams.get("tab"));

  if (liveTab !== serverTab) {
    return <PageSpinner />;
  }

  return children;
}
