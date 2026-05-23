"use client";

import { useState, useTransition } from "react";
import { formatVNDateTime } from "@comtammatu/shared/time";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@comtammatu/ui/components/alert-dialog";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import {
  Lock as IconLock,
  LockOpen as IconLockOpen,
  ShieldCheck as IconShieldLock,
} from "lucide-react";
import {
  closePeriodSoft,
  closePeriodHard,
  reopenPeriod,
} from "../dashboard-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export type PeriodRow = {
  year: number;
  month: number;
  softClosedAt: string | null;
  hardClosedAt: string | null;
};

interface PeriodCloseCardProps {
  period: PeriodRow;
  /** When true, wraps the hard-close + reopen actions in a confirm dialog with 2FA-style
   *  re-enter of a user-provided code. For pre-pilot we only use typed confirm. */
  strictConfirm?: boolean;
  onChanged?: () => void;
  className?: string;
}

/**
 * Per-month accounting_periods admin card (S12).
 *
 * Shows soft/hard close status + admin actions:
 *   - Soft close: day 5 auto or manual via button
 *   - Hard close: day 15 auto or manual — destructive, requires typed "CLOSE"
 *   - Reopen: only when hard_closed_at NOT NULL, requires typed "REOPEN"
 *
 * All 3 RPCs gated by `accounting:period_reopen` permission (Admin-only).
 */
export function PeriodCloseCard({
  period,
  strictConfirm = true,
  onChanged,
  className,
}: PeriodCloseCardProps) {
  const [isBusy, startAction] = useTransition();
  const monthLabel = `${String(period.month).padStart(2, "0")}/${period.year}`;

  function handleSoftClose() {
    startAction(async () => {
      const res = await closePeriodSoft({
        year: period.year,
        month: period.month,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không soft close được");
        return;
      }
      toast.success(`Đã soft close ${monthLabel}`);
      onChanged?.();
    });
  }

  function handleHardClose() {
    startAction(async () => {
      const res = await closePeriodHard({
        year: period.year,
        month: period.month,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không hard close được");
        return;
      }
      toast.success(`Đã hard close ${monthLabel}`);
      onChanged?.();
    });
  }

  function handleReopen() {
    startAction(async () => {
      const res = await reopenPeriod({
        year: period.year,
        month: period.month,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không reopen được");
        return;
      }
      toast.success(`Đã reopen ${monthLabel}`);
      onChanged?.();
    });
  }

  const isSoftClosed = period.softClosedAt !== null;
  const isHardClosed = period.hardClosedAt !== null;

  return (
    <Card
      className={cn(
        isHardClosed && "border-destructive/30 bg-destructive/10",
        !isHardClosed && isSoftClosed && "border-warning/30 bg-warning/10",
        className,
      )}
      data-slot="period-close-card"
      data-period={monthLabel}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Kỳ {monthLabel}
              {isHardClosed ? (
                <Badge className="bg-destructive/15 text-destructive border-destructive/40 border">
                  <IconShieldLock className="mr-1 size-3" />
                  Hard closed
                </Badge>
              ) : isSoftClosed ? (
                <Badge className="bg-warning/15 text-warning-foreground border-warning/40 border">
                  <IconLock className="mr-1 size-3" />
                  Soft closed
                </Badge>
              ) : (
                <Badge variant="outline">
                  <IconLockOpen className="mr-1 size-3" />
                  Open
                </Badge>
              )}
            </CardTitle>
            {isHardClosed ? (
              <CardDescription>{fmt(period.hardClosedAt!)}</CardDescription>
            ) : isSoftClosed ? (
              <CardDescription>{fmt(period.softClosedAt!)}</CardDescription>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {!isSoftClosed ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleSoftClose}
              disabled={isBusy}
            >
              {isBusy ? <Spinner /> : <IconLock className="size-4" />}
              Soft close
            </Button>
          ) : null}
          {!isHardClosed ? (
            <ConfirmDestructiveButton
              phrase="CLOSE"
              label="Hard close"
              description={`Hard close ${monthLabel} sẽ chặn mọi ghi lùi ngày. Admin cần reopen nếu phát hiện sai sót sau.`}
              onConfirm={handleHardClose}
              disabled={isBusy}
              icon={<IconShieldLock className="size-4" />}
              variant="destructive"
              strict={strictConfirm}
            />
          ) : null}
          {isHardClosed ? (
            <ConfirmDestructiveButton
              phrase="REOPEN"
              label="Reopen kỳ"
              description={`Reopen ${monthLabel} gỡ cả hard + soft close. Tất cả audit trail vẫn còn. Chỉ làm khi có lý do kế toán rõ ràng.`}
              onConfirm={handleReopen}
              disabled={isBusy}
              icon={<IconLockOpen className="size-4" />}
              variant="outline"
              strict={strictConfirm}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmDestructiveButton({
  phrase,
  label,
  description,
  onConfirm,
  disabled,
  icon,
  variant,
  strict,
}: {
  phrase: string;
  label: string;
  description: string;
  onConfirm: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  variant: "destructive" | "outline";
  strict: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const canConfirm = !strict || typed === phrase;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant={variant} disabled={disabled}>
          {icon}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {strict ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-phrase" className="text-xs">
              Gõ <span className="font-mono font-semibold">{phrase}</span> để
              xác nhận
            </Label>
            <Input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={phrase}
              autoComplete="off"
            />
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{ACTIONS_VI.cancel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => {
              onConfirm();
              setOpen(false);
              setTyped("");
            }}
          >
            Xác nhận
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function fmt(iso: string): string {
  return formatVNDateTime(iso, iso);
}
