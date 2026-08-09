"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { ReasonConfirmDialog } from "@/components/reason-confirm-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsOnline } from "@/components/pwa-runtime";
import { AppDetailFooter } from "@/components/surface";
import { cancelStockRequest } from "@/(protected)/inventory/stock-request-actions";
import { messages } from "@lib/messages";

const copy = messages.inventory.stockRequests.branch;

export function StockRequestBranchActions({
  branchId,
  requestId,
  editable,
  editHref,
}: {
  branchId: number;
  requestId: number;
  editable: boolean;
  editHref?: string;
}) {
  const router = useRouter();
  const isOnline = useIsOnline();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!editable) return null;

  function cancelRequest() {
    if (!isOnline) {
      toast.error(messages.inventory.stockRequests.journey.offlineMutation);
      return;
    }
    startTransition(async () => {
      const result = await cancelStockRequest({
        branchId,
        requestId,
        reason,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.cancelSuccess);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <AppDetailFooter
        sticky
        leading={
          <Button
            type="button"
            variant="outline"
            size="touch"
            disabled={isPending || !isOnline}
            onClick={() => setOpen(true)}
          >
            {copy.cancelAction}
          </Button>
        }
        trailing={
          <Button
            size="touch"
            render={
              <Link
                href={
                  editHref ??
                  `/br/${branchId}/stock/requests/new?requestId=${requestId}`
                }
              />
            }
          >
            {copy.editAction}
          </Button>
        }
      />
      <ReasonConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.cancelTitle}
        description={copy.cancelDescription}
        reasonId="stock-request-cancel-reason"
        reason={reason}
        onReasonChange={setReason}
        reasonLabel={copy.cancelReasonLabel}
        reasonPlaceholder={copy.cancelReasonPlaceholder}
        cancelLabel={copy.cancelBack}
        confirmLabel={copy.cancelAction}
        onConfirm={cancelRequest}
        isPending={isPending || !isOnline}
      />
    </>
  );
}
