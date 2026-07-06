"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm as confirmDialog } from "@comtammatu/ui/components/confirm-dialog";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { messages } from "@lib/messages";
import {
  confirmSupplierReturn,
  transitionSupplierReturn,
} from "@/(protected)/inventory/supplier-return-actions";
import { AppDetailFooter } from "@/components/surface";

const DETAIL = messages.inventory.supplierReturns.detail;

interface Props {
  returnId: number;
  status: string;
  resolution: string;
  canConfirm: boolean;
}

export function SupplierReturnConfirmCta({
  returnId,
  status,
  resolution,
  canConfirm,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  if (!canConfirm) return null;
  if (status !== "draft" && status !== "sent") return null;

  async function runConfirm() {
    setPending(true);
    try {
      const res = await confirmSupplierReturn(returnId);
      if (!res.success) {
        toast.error(res.error ?? DETAIL.actionFailed);
        return;
      }
      toast.success(DETAIL.confirmedOk);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function runTransition(
    target: "credited" | "refunded" | "cancelled",
    needsConfirmDialog: boolean,
  ) {
    if (needsConfirmDialog) {
      const ok = await confirmDialog({
        title: DETAIL.cancelConfirmTitle,
        description: DETAIL.cancelConfirmBody,
        variant: "destructive",
      });
      if (!ok) return;
    }
    setPending(true);
    try {
      const res = await transitionSupplierReturn({
        returnId,
        targetStatus: target,
      });
      if (!res.success) {
        toast.error(res.error ?? DETAIL.actionFailed);
        return;
      }
      toast.success(DETAIL.transitionedOk);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <AppDetailFooter
      sticky
      mobileReverse={false}
      stacked
      trailing={
        <>
          {status === "draft" ? (
            <>
              <NoteCallout tone="muted">{DETAIL.confirmHint}</NoteCallout>
              <Button
                type="button"
                size="touch-lg"
                disabled={pending}
                onClick={runConfirm}
              >
                {pending ? <Spinner className="size-5" /> : null}
                {pending ? DETAIL.confirmingState : DETAIL.confirmCta}
              </Button>
            </>
          ) : null}

          {status === "sent" ? (
            <>
              {resolution === "credit_note" ? (
                <Button
                  type="button"
                  size="touch-lg"
                  disabled={pending}
                  onClick={() => runTransition("credited", false)}
                >
                  {pending ? <Spinner className="size-5" /> : null}
                  {DETAIL.creditCta}
                </Button>
              ) : null}
              {resolution === "cash_refund" ? (
                <Button
                  type="button"
                  size="touch-lg"
                  disabled={pending}
                  onClick={() => runTransition("refunded", false)}
                >
                  {pending ? <Spinner className="size-5" /> : null}
                  {DETAIL.refundCta}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={pending}
                onClick={() => runTransition("cancelled", true)}
              >
                {DETAIL.cancelCta}
              </Button>
            </>
          ) : null}
        </>
      }
    />
  );
}
