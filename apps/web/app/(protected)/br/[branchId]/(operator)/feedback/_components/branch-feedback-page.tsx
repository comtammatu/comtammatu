import type { ReactNode } from "react";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";

export function BranchFeedbackPage({
  title,
  children,
}: {
  branchId: number;
  title: string;
  children: ReactNode;
}) {
  return <BranchOperatorPage title={title}>{children}</BranchOperatorPage>;
}
