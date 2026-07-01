"use client";

import { ErrorPanel, type ErrorPanelProps } from "@/components/error-panel";

export default function RouteError(props: ErrorPanelProps) {
  return <ErrorPanel {...props} />;
}
