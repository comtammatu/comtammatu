"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { WasteOperationalForm } from "@/(protected)/inventory/waste/waste-operational-form";
import type { WasteFormContext } from "@lib/inventory/waste-create-model";
import { messages } from "@lib/messages";

export function BranchWasteCreateClient({
  branchId,
  branchName,
  canCreateWaste,
  loadFailed,
  context,
}: {
  branchId: number;
  branchName: string;
  canCreateWaste: boolean;
  loadFailed: boolean;
  context: WasteFormContext | null;
}) {
  const router = useRouter();
  const copy = messages.inventory.waste.operational;
  const stockBasePath = `/br/${branchId}/stock`;
  const unavailable = loadFailed
    ? "Không tải được dữ liệu kho."
    : copy.unavailable;

  return (
    <BranchOperatorPage
      title={copy.title}
      description={branchName}
      hideHeaderOnMobile
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link href={stockBasePath} aria-label={ACTIONS_VI.back} />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{copy.title}</p>
          <p className="truncate text-xs text-muted-foreground">{branchName}</p>
        </div>
      </BranchOperatorControlBar>
      {!canCreateWaste || !context ? (
        <AppEmptyState compact title={unavailable} />
      ) : (
        <BranchOperatorPanel
          title={copy.panelTitle}
          description={copy.panelDescription}
          size="sm"
        >
          <WasteOperationalForm
            context={context}
            cancelHref={stockBasePath}
            onCreated={(issueId) =>
              router.push(`/br/${branchId}/stock/issues/${issueId}`)
            }
          />
        </BranchOperatorPanel>
      )}
    </BranchOperatorPage>
  );
}
