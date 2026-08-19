import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";

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
    <BranchOperatorPage title={title} hideHeaderOnMobile>
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link
              href={`/br/${branchId}/settings`}
              aria-label={ACTIONS_VI.back}
            />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
        </div>
      </BranchOperatorControlBar>
      {children}
    </BranchOperatorPage>
  );
}
