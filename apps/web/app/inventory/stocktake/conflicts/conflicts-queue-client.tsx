"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { OctagonAlert as IconAlertOctagon, Clock as IconClock, Check as IconCheck, ArrowRight as IconArrowRight, ArrowLeft as IconArrowLeft, Pencil as IconPencil, Ban as IconBan } from "lucide-react";
import { InventoryHeader } from "../../_components/inventory-header";
import { InventoryPageContent } from "../../_components/inventory-page-layout";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import {
  resolveStocktakeConflict,
  type StocktakeConflictRow,
} from "../../stocktake-actions";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const CONFLICT_TYPE_VI: Record<StocktakeConflictRow["conflictType"], string> = {
  is_final_overwrite: "Ghi đè dòng đã final",
  concurrent_round_submit: "Submit trùng round",
  clock_tamper: "Giả lập giờ client",
  unknown: "Khác",
};

type Resolution = "keep_server" | "apply_client" | "manual_value" | "reject";

interface Props {
  branchId: number;
  includeResolved: boolean;
  initial: StocktakeConflictRow[];
}

/**
 * Conflict queue (S13b).
 *
 * Renders pending stocktake_conflicts rows so QLV can resolve each via
 * `resolve_stocktake_conflict`. Four resolution modes:
 *   - keep_server:  preserve existing server-side counted_quantity
 *   - apply_client: overwrite with offline client's counted_quantity
 *   - manual_value: QLV enters a specific number (e.g. escalation outcome)
 *   - reject:       leave the line untouched, mark conflict resolved
 *
 * Enforces OFFLINE-NO-SILENT-CLIENTWINS regression rule — no auto-merge.
 */
export function ConflictsQueueClient({
  branchId,
  includeResolved,
  initial,
}: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<StocktakeConflictRow[]>(initial);

  const pending = rows.filter((r) => !r.resolvedAt);
  const resolved = rows.filter((r) => r.resolvedAt);

  function applyResolution(conflictId: number, partial: Partial<StocktakeConflictRow>) {
    setRows((prev) =>
      prev.map((r) => (r.id === conflictId ? { ...r, ...partial } : r)),
    );
  }

  return (
    <>
      <InventoryHeader
        title="Xử lý lệch kiểm kê"
        description={`CN #${branchId} · ${pending.length} chờ xử lý · ${resolved.length} đã resolve`}
      />
      <InventoryPageContent>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={includeResolved ? "outline" : "default"}
            size="sm"
            asChild
          >
            <Link href={`/inventory/stocktake/conflicts?branchId=${branchId}`}>
              Chỉ chờ xử lý
            </Link>
          </Button>
          <Button
            type="button"
            variant={includeResolved ? "default" : "outline"}
            size="sm"
            asChild
          >
            <Link href={`/inventory/stocktake/conflicts?branchId=${branchId}&resolved=1`}>
              Bao gồm đã resolve
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.refresh()}
          >
            {ACTIONS_VI.refresh}
          </Button>
        </div>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <IconCheck className="size-8 text-success" />
              <div className="text-sm font-medium">
                Không có conflict nào chờ xử lý
              </div>
              <div className="text-xs text-muted-foreground">
                Offline sync đang sạch — các round đều được accept trực tiếp.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <ConflictRow
                key={row.id}
                row={row}
                onResolved={(patch) => applyResolution(row.id, patch)}
              />
            ))}
          </div>
        )}

        {includeResolved && resolved.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Đã resolve ({resolved.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {resolved.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <Badge variant="outline" className="gap-1">
                      #{r.id}
                    </Badge>
                    <span className="font-medium">{r.ingredientName}</span>
                    <span className="text-xs text-muted-foreground">
                      R{r.roundNo} · Session #{r.sessionId}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "ml-auto gap-1",
                        resolutionTone(r.resolution),
                      )}
                    >
                      {resolutionLabelVi(r.resolution)}
                      {r.resolutionQty !== null ? ` · ${r.resolutionQty}` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </InventoryPageContent>
    </>
  );
}

interface ConflictRowProps {
  row: StocktakeConflictRow;
  onResolved: (patch: Partial<StocktakeConflictRow>) => void;
}

function ConflictRow({ row, onResolved }: ConflictRowProps) {
  const [pending, startTransition] = useTransition();
  const [manualQty, setManualQty] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [showManual, setShowManual] = useState(false);

  const clientQty = Number(row.clientPayload?.["counted_quantity"] ?? NaN);
  const serverQty = Number(
    row.serverPayload?.["existing_counted_quantity"] ??
      row.serverPayload?.["counted_quantity"] ??
      NaN,
  );

  function submit(resolution: Resolution) {
    if (resolution === "manual_value") {
      const q = Number(manualQty);
      if (!Number.isFinite(q) || q < 0) {
        toast.error("Nhập số lượng hợp lệ");
        return;
      }
    }
    startTransition(async () => {
      const res = await resolveStocktakeConflict({
        conflictId: row.id,
        resolution,
        manualQty: resolution === "manual_value" ? Number(manualQty) : undefined,
        note: note.trim() || undefined,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không resolve được");
        return;
      }
      toast.success(
        `Conflict #${row.id} resolved — ${resolutionLabelVi(res.data.resolution as Resolution)}`,
      );
      onResolved({
        resolvedAt: new Date().toISOString(),
        resolution: res.data.resolution as Resolution,
        resolutionQty: res.data.finalQty,
        resolutionNote: note.trim() || null,
      });
    });
  }

  return (
    <Card data-slot="conflict-row" data-conflict-id={row.id}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <IconAlertOctagon className="size-4 text-destructive" />
              <span className="font-medium">{row.ingredientName}</span>
              <Badge variant="outline" className="gap-1">
                Session #{row.sessionId}
              </Badge>
              <Badge variant="outline" className="gap-1">
                R{row.roundNo}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  "gap-1",
                  row.conflictType === "clock_tamper"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-tier-note/40 bg-tier-note/10 text-tier-note-foreground",
                )}
              >
                {CONFLICT_TYPE_VI[row.conflictType]}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <IconClock className="size-3.5" />
              Submit lúc {formatDateTime(row.submittedAt)}
              {row.submittedBy ? ` · bởi ${truncateUid(row.submittedBy)}` : null}
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-info/30 bg-info/10 p-2 text-xs">
            <div className="font-medium text-info">Server đang giữ</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {Number.isFinite(serverQty) ? serverQty : "—"}
            </div>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-2xs text-muted-foreground">
              {JSON.stringify(row.serverPayload ?? {}, null, 2)}
            </pre>
          </div>
          <div className="rounded-md border border-tier-note/30 bg-tier-note/10 p-2 text-xs">
            <div className="font-medium text-tier-note-foreground">Client offline submit</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {Number.isFinite(clientQty) ? clientQty : "—"}
            </div>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all text-2xs text-muted-foreground">
              {JSON.stringify(row.clientPayload ?? {}, null, 2)}
            </pre>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Ghi chú (tuỳ chọn, ≤ 500 ký tự)</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="VD: Client lệch do cân điện tử yếu pin; keep server..."
          />
        </div>

        {showManual ? (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Số lượng thủ công</Label>
              <FormattedNumberInput
                value={manualQty}
                onValueChange={setManualQty}
                maxFractionDigits={3}
              />
            </div>
            <Button
              type="button"
              onClick={() => submit("manual_value")}
              disabled={pending || manualQty === ""}
            >
              <IconCheck className="size-4" /> Xác nhận thủ công
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowManual(false)}
              disabled={pending}
            >
              {ACTIONS_VI.cancel}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submit("keep_server")}
              disabled={pending || !Number.isFinite(serverQty)}
            >
              <IconArrowLeft className="size-4" /> Giữ server
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submit("apply_client")}
              disabled={pending || !Number.isFinite(clientQty)}
            >
              <IconArrowRight className="size-4" /> Áp dụng client
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowManual(true)}
              disabled={pending}
            >
              <IconPencil className="size-4" /> Thủ công
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => submit("reject")}
              disabled={pending}
            >
              <IconBan className="size-4" /> Reject (không đổi)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function resolutionLabelVi(r: Resolution | null | undefined): string {
  switch (r) {
    case "keep_server":
      return "Giữ server";
    case "apply_client":
      return "Áp dụng client";
    case "manual_value":
      return "Thủ công";
    case "reject":
      return "Reject";
    default:
      return "—";
  }
}

function resolutionTone(r: Resolution | null | undefined): string {
  switch (r) {
    case "keep_server":
      return "border-info/40 text-info";
    case "apply_client":
      return "border-tier-note/40 text-tier-note-foreground";
    case "manual_value":
      return "border-tier-elite/40 text-tier-elite";
    case "reject":
      return "border-border text-muted-foreground";
    default:
      return "";
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function truncateUid(uid: string): string {
  if (!uid) return "—";
  if (uid.length <= 10) return uid;
  return `${uid.slice(0, 6)}…${uid.slice(-4)}`;
}

