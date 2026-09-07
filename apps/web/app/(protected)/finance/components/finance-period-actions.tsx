"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@comtammatu/ui/components/sonner";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ConfirmDialog } from "@comtammatu/ui/components/confirm-dialog";
import { ReasonConfirmDialog } from "@comtammatu/ui/components/reason-confirm-dialog";
import { messages } from "@lib/messages";
import {
  closeFinancePeriodSoftAction,
  closeFinancePeriodHardAction,
  reopenFinancePeriodAction,
} from "../_actions/period-close-actions";

const copy = messages.finance.basic.exceptions;

interface FinancePeriodActionsProps {
  year: number;
  month: number;
  periodStatus: string;
  canClose: boolean;
  blockerCount: number;
  warningCount: number;
  canClosePeriod?: boolean;
  canReopenPeriod?: boolean;
}

export function FinancePeriodActions({
  year,
  month,
  periodStatus,
  canClose,
  blockerCount,
  warningCount,
  canClosePeriod = false,
  canReopenPeriod = false,
}: FinancePeriodActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [showSoftClose, setShowSoftClose] = useState(false);
  const [showHardClose, setShowHardClose] = useState(false);
  const [showReopen, setShowReopen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const statusLabel =
    periodStatus === "hard_closed"
      ? copy.periodStatusLabels.hard_closed
      : periodStatus === "soft_closed"
        ? copy.periodStatusLabels.soft_closed
        : copy.periodStatusLabels.open;

  const statusVariant =
    periodStatus === "hard_closed"
      ? "success"
      : periodStatus === "soft_closed"
        ? "warning"
        : "outline";

  const handleSoftClose = () => {
    startTransition(async () => {
      const res = await closeFinancePeriodSoftAction({
        year,
        month,
        acknowledgedWarnings: warningCount > 0,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(copy.periodStatusLabels.soft_closed);
      setShowSoftClose(false);
      router.refresh();
    });
  };

  const handleHardClose = () => {
    startTransition(async () => {
      const res = await closeFinancePeriodHardAction({
        year,
        month,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(copy.periodStatusLabels.hard_closed);
      setShowHardClose(false);
      router.refresh();
    });
  };

  const handleReopen = () => {
    startTransition(async () => {
      const res = await reopenFinancePeriodAction({
        year,
        month,
        reason: reopenReason,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(copy.periodStatusLabels.open);
      setShowReopen(false);
      setReopenReason("");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground">
          {copy.periodStatusPrefix}
        </span>
        <Badge variant={statusVariant}>{statusLabel}</Badge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {periodStatus === "open" && canClosePeriod && (
          <Button
            type="button"
            size="sm"
            variant={canClose ? "default" : "outline"}
            disabled={!canClose || blockerCount > 0 || isPending}
            title={blockerCount > 0 ? copy.closeBlockedTooltip : undefined}
            onClick={() => setShowSoftClose(true)}
          >
            {copy.closeSoftButton}
          </Button>
        )}

        {periodStatus === "soft_closed" && (
          <>
            {canClosePeriod && (
              <Button
                type="button"
                size="sm"
                variant="default"
                disabled={isPending}
                onClick={() => setShowHardClose(true)}
              >
                {copy.closeHardButton}
              </Button>
            )}
            {canReopenPeriod && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => setShowReopen(true)}
              >
                {copy.reopenButton}
              </Button>
            )}
          </>
        )}

        {periodStatus === "hard_closed" && canReopenPeriod && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => setShowReopen(true)}
          >
            {copy.reopenButton}
          </Button>
        )}
      </div>

      {/* Confirm Soft Close */}
      <ConfirmDialog
        open={showSoftClose}
        onOpenChange={setShowSoftClose}
        title={copy.softCloseConfirmTitle}
        description={copy.softCloseConfirmDesc(month, year)}
        confirmText={copy.closeSoftButton}
        onConfirm={handleSoftClose}
      />

      {/* Confirm Hard Close */}
      <ConfirmDialog
        open={showHardClose}
        onOpenChange={setShowHardClose}
        title={copy.hardCloseConfirmTitle}
        description={copy.hardCloseConfirmDesc(month, year)}
        confirmText={copy.closeHardButton}
        variant="destructive"
        onConfirm={handleHardClose}
      />

      {/* Reason Dialog for Reopen */}
      <ReasonConfirmDialog
        open={showReopen}
        onOpenChange={setShowReopen}
        title={copy.reopenConfirmTitle}
        description={copy.reopenConfirmDesc(month, year)}
        reasonId="period-reopen-reason"
        reason={reopenReason}
        onReasonChange={setReopenReason}
        reasonLabel={copy.reopenReasonLabel}
        reasonPlaceholder={copy.reopenReasonPlaceholder}
        reasonMinLength={10}
        cancelLabel="Hủy"
        confirmLabel={copy.reopenButton}
        confirmVariant="destructive"
        canConfirm={reopenReason.trim().length >= 10 && !isPending}
        isPending={isPending}
        onConfirm={handleReopen}
      />
    </div>
  );
}
