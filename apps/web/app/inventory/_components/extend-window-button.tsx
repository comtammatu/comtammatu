"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@comtammatu/ui/components/dialog";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { AlarmClockPlus as IconClockPlus } from "lucide-react";
import { extendExpressWindow } from "../variance-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const NOTE_MIN = 10;
const MINUTE_OPTIONS = [15, 30, 45, 60] as const;

interface ExtendWindowButtonProps {
  branchId: number;
  /** Remaining extend credits for current user this week. Rate-limit 3. */
  remainingCredits?: number;
  /** Called after successful extend. */
  onSuccess?: (extendedUntil: string) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * QL CN extend Express window button (S10/S14).
 * Opens a small dialog — pick minutes (+15/30/45/60) + short note (≥10 chars).
 * Server rate-limits 3/week; UI surfaces remaining credits and disables
 * button at 0.
 */
export function ExtendWindowButton({
  branchId,
  remainingCredits,
  onSuccess,
  disabled,
  className,
}: ExtendWindowButtonProps) {
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number>(30);
  const [note, setNote] = useState("");
  const [isSubmitting, startSubmit] = useTransition();

  const outOfCredits = typeof remainingCredits === "number" && remainingCredits <= 0;
  const noteOk = note.length >= NOTE_MIN;
  const canSubmit = noteOk && !isSubmitting;

  function handleClose(next: boolean) {
    if (isSubmitting) return;
    setOpen(next);
    if (!next) {
      setNote("");
      setMinutes(30);
    }
  }

  function handleSubmit() {
    startSubmit(async () => {
      const res = await extendExpressWindow({ branchId, minutes, note });
      if (!res.success) {
        toast.error(res.error ?? "Không extend được");
        return;
      }
      toast.success(
        `Đã extend +${minutes} phút • kết thúc: ${res.data?.extendedUntil ? new Date(res.data.extendedUntil).toLocaleTimeString("vi-VN") : "?"}`,
      );
      if (res.data?.extendedUntil) {
        onSuccess?.(res.data.extendedUntil);
      }
      handleClose(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || outOfCredits}
          className={cn("gap-1", className)}
          title={outOfCredits ? "Đã extend 3/3 tuần này" : undefined}
        >
          <IconClockPlus className="size-4" />
          Extend window
          {typeof remainingCredits === "number" ? (
            <span className="ml-1 text-xs text-muted-foreground">
              ({remainingCredits}/3)
            </span>
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Extend Express window</DialogTitle>
          <DialogDescription>
            Kéo dài cửa sổ auto-approve tối đa 60 phút.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="ext-minutes" className="text-sm font-medium">
              Số phút
            </Label>
            <Select
              value={String(minutes)}
              onValueChange={(v) => setMinutes(Number(v))}
              disabled={isSubmitting}
            >
              <SelectTrigger id="ext-minutes">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MINUTE_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    +{m} phút
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ext-note" className="text-sm font-medium">
                Lý do extend
              </Label>
              <span
                className={cn(
                  "text-xs",
                  noteOk ? "text-success" : "text-muted-foreground",
                )}
              >
                {note.length}/{NOTE_MIN} ký tự
              </span>
            </div>
            <Textarea
              id="ext-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              placeholder="Xe NCC đến trễ 20 phút do kẹt xe…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            {ACTIONS_VI.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting ? <Spinner /> : `Extend +${minutes}p`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
