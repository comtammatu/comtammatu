"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StaffRole } from "@comtammatu/shared/auth";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { StatusBadge } from "@/components/status-badge";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import { messages } from "@lib/messages";
import { TransferReceiveClient } from "../receive/[id]/transfer-receive-client";
import { BranchTransferDetailClient } from "./[id]/branch-transfer-detail-client";

interface BranchTransferSheetProps {
  branchId: number;
  mode: "view" | "receive";
  transfer: TransferDetail;
  userRole: StaffRole;
  userBranchId: number | null;
}

export function BranchTransferSheet({
  branchId,
  mode,
  transfer,
  userRole,
  userBranchId,
}: BranchTransferSheetProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dirty, setDirty] = useState(false);
  const copy = messages.inventory.transfer;

  function href(nextMode: "view" | "receive" | null) {
    const params = new URLSearchParams(searchParams);
    if (nextMode) {
      params.set("transferId", String(transfer.id));
      params.set("mode", nextMode);
    } else {
      params.delete("transferId");
      params.delete("mode");
    }
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  async function closeSheet() {
    if (
      dirty &&
      !(await confirm({
        title: messages.common.unsavedChangesTitle,
        description: messages.common.unsavedChangesDescription,
        variant: "destructive",
      }))
    ) {
      return;
    }
    router.replace(href(null), { scroll: false });
  }

  const listHref = href(null);
  const description = `${transfer.fromLocation} → ${transfer.toLocation}`;

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) void closeSheet();
      }}
    >
      <SheetContent
        side="bottom"
        fullscreen
        className="bg-background p-0 text-foreground"
      >
        <SheetHeader>
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle className="min-w-0 flex-1 truncate font-mono tabular-nums">
              {transfer.code}
            </SheetTitle>
            <StatusBadge domain="inventory" value={transfer.status} size="sm" />
          </div>
          <SheetDescription className="truncate">
            {mode === "receive"
              ? copy.receiveNative.receiveFrom(transfer.fromBranch)
              : description}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
          {mode === "receive" ? (
            <TransferReceiveClient
              transfer={transfer}
              backHref={listHref}
              detailHref={href("view")}
              presentation="sheet"
              onDirtyChange={setDirty}
            />
          ) : (
            <BranchTransferDetailClient
              branchId={branchId}
              transfer={transfer}
              userRole={userRole}
              userBranchId={userBranchId}
              presentation="sheet"
              listHref={listHref}
              receiveHref={href("receive")}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
