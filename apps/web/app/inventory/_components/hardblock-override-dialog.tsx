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
import { ShieldCheck as IconShieldLock } from "lucide-react";
import { HARDBLOCK_REASON_LABELS_VI } from "@comtammatu/shared/labels";
import { PhotoUploadInput } from "./photo-upload-input";
import { submitHardblockOverride } from "../variance-actions";

const NOTE_MIN = 50;

type HardblockReason = keyof typeof HARDBLOCK_REASON_LABELS_VI;

interface HardblockOverrideDialogProps {
  grnItemId: number;
  tenantId: number;
  /** Current baseline variance pct (signed), for context copy. */
  variancePct?: number | null;
  /** Called after successful override. Parent should refresh GRN state. */
  onSuccess?: () => void;
  /** Trigger button label override. */
  triggerLabel?: string;
  /** Disable trigger (e.g. rate-limit known ahead). */
  disabled?: boolean;
  className?: string;
}

/**
 * GRN variance tier-3 hardblock override modal (S10).
 *
 * Flow:
 *  1. QLV clicks "Yêu cầu override"
 *  2. Upload PDF evidence → grn-evidence bucket
 *  3. Choose reason code
 *  4. Write note ≥50 chars (live counter)
 *  5. Submit → override_grn_hardblock RPC:
 *     - writes grn_hardblock_overrides row
 *     - inserts 30-day grn_baseline_pause
 *     - clears grn_items.is_hard_blocked
 *  6. Parent refreshes via onSuccess
 *
 * Rate limit 2/week/user handled server-side; error surfaced as toast.
 */
export function HardblockOverrideDialog({
  grnItemId,
  tenantId,
  variancePct,
  onSuccess,
  triggerLabel = "Yêu cầu override",
  disabled,
  className,
}: HardblockOverrideDialogProps) {
  const [open, setOpen] = useState(false);
  const [evidenceUrl, setEvidenceUrl] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<HardblockReason | "">("");
  const [note, setNote] = useState("");
  const [isSubmitting, startSubmit] = useTransition();

  const noteLen = note.length;
  const noteOk = noteLen >= NOTE_MIN;
  const canSubmit = Boolean(evidenceUrl) && Boolean(reasonCode) && noteOk;

  function handleClose(next: boolean) {
    if (isSubmitting) return;
    setOpen(next);
    if (!next) {
      // Reset on close
      setEvidenceUrl(null);
      setReasonCode("");
      setNote("");
    }
  }

  function handleSubmit() {
    if (!evidenceUrl || !reasonCode) return;
    startSubmit(async () => {
      const res = await submitHardblockOverride({
        grnItemId,
        evidenceUrl,
        reasonCode,
        note,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không override được");
        return;
      }
      toast.success("Đã ghi nhận override — dòng được mở khoá");
      onSuccess?.();
      handleClose(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={disabled}
          className={cn("gap-1", className)}
        >
          <IconShieldLock className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Override hardblock (tier 3)</DialogTitle>
          <DialogDescription>
            Lệch giá
            {typeof variancePct === "number"
              ? ` ${variancePct > 0 ? "+" : ""}${variancePct.toFixed(1)}%`
              : " ≥100%"}
            . QLV cần cung cấp bằng chứng + lý do + ghi chú ≥{NOTE_MIN} ký tự.
            Rate-limit 2 lần/tuần. Sau khi override, baseline của (NCC, SKU) bị tạm dừng 30 ngày.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-sm font-medium">Bằng chứng (PDF/ảnh)</Label>
            <PhotoUploadInput
              tenantId={tenantId}
              folder={`grn-item/${grnItemId}`}
              bucket="grn-evidence"
              acceptTypes="image+pdf"
              value={evidenceUrl}
              onChange={setEvidenceUrl}
              allowPaste={false}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <Label htmlFor="hb-reason" className="text-sm font-medium">
              Lý do
            </Label>
            <Select
              value={reasonCode}
              onValueChange={(v) => setReasonCode(v as HardblockReason)}
              disabled={isSubmitting}
            >
              <SelectTrigger id="hb-reason">
                <SelectValue placeholder="Chọn lý do" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(HARDBLOCK_REASON_LABELS_VI) as HardblockReason[])
                  .map((key) => (
                    <SelectItem key={key} value={key}>
                      {HARDBLOCK_REASON_LABELS_VI[key]}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="hb-note" className="text-sm font-medium">
                Ghi chú chi tiết
              </Label>
              <span
                className={cn(
                  "text-xs",
                  noteOk ? "text-success" : "text-muted-foreground",
                )}
              >
                {noteLen}/{NOTE_MIN} ký tự
              </span>
            </div>
            <Textarea
              id="hb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              placeholder="Mô tả cụ thể lý do override: nguồn cung, giá thị trường tham khảo, tác động lên cost món, v.v."
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isSubmitting}
          >
            Huỷ
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? <Spinner /> : "Xác nhận override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
