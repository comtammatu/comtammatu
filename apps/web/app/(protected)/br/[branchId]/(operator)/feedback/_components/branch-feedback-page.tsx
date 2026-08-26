import type { ReactNode } from "react";
import { AppBackLink } from "@/components/surface";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";

export function BranchFeedbackPage({
  branchId,
  title,
  children,
}: {
  branchId: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <BranchOperatorPage
      title={title}
      back={<AppBackLink href={`/br/${branchId}`} />}
    >
      {children}
    </BranchOperatorPage>
  );
}
