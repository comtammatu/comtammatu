import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { BranchOperatorControlBar } from "@lib/branch-operator/components/branch-operator-page";

export function BranchSettingsBackControl({
  branchId,
  title,
}: {
  branchId: number;
  title: string;
}) {
  return (
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
  );
}
