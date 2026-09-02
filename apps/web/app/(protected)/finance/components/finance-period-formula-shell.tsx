"use client";

import type { ReactNode } from "react";

/**
 * Keeps the complete finance equation visible at every viewport width.
 */
export function FinancePeriodFormulaShell({
  details,
}: {
  summary: ReactNode;
  details: ReactNode;
}) {
  return <div className="grid gap-4">{details}</div>;
}
