"use client";

import { ErrorPanel, type ErrorPanelProps } from "@/components/error-panel";

export default function RouteError(props: ErrorPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4">
      <ErrorPanel {...props} />
    </div>
  );
}
