"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { OctagonAlert as IconAlertOctagon, Clock as IconClock, Check as IconCheck, ArrowRight as IconArrowRight, ArrowLeft as IconArrowLeft, Pencil as IconPencil, Ban as IconBan, TriangleAlert as IconWarning } from "lucide-react";
import { InventoryHeader } from "../../_components/inventory-header";
import { InventoryPageContent } from "../../_components/inventory-page-layout";
import { InventoryBulkActionBar } from "../../_components/bulk-action-bar";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { useInventoryBulkSelection } from "../../_lib/use-inventory-bulk-selection";
import {
  resolveStocktakeConflict,
  type StocktakeConflictRow,
} from "../../stocktake-actions";

const CONFLICT_TYPE_VI: Record<StocktakeConflictRow["conflictType"], string> = {
  is_final_overwrite: "Ghi đè dòng đã final",
  concurrent_round_submit: "Submit trùng round",
  clock_tamper: "Giả lập giờ client",
  unknown: "Khác",
};

type ConflictTypeFilter = StocktakeConflictRow["conflictType"] | "all";
type Resolution = "keep_server" | "apply_client" | "manual_value" | "reject";
type BulkResolution = Extract<Resolution, "keep_server" | "apply_client" | "reject">;

interface Props {
  branchId: number;
  includeResolved: boolean;
  initial: StocktakeConflictRow[];
}

const FILTER_OPTIONS: Array<{ value: ConflictTypeFilter; label: string }> = [
  { value: "all", label: "Tất cả" },
  { value: "clock_tamper", label: "Giả lập giờ" },
  { value: "concurrent_round_submit", label: "Trùng round" },
  { value: "is_final_overwrite", label: "Ghi đè final" },
  { value: "unknown", label: "Khác" },
];

/**
 * Conflict queue (S13b).
 *
 * Renders pending stocktake_conflicts rows so QLV can resolve each via
 * `resolve_stocktake_conflict`. Four per-row resolution modes:
 *   - keep_server:  preserve existing server-side counted_quantity
 *   - apply_client: overwrite with offline client's counted_quantity
 *   - manual_value: QLV enters a specific number (e.g. escalation outcome)
 *   - reject:       leave the line untouched, mark conflict resolved
 *
 * Phase 6 adds:
 *   - bulk resolve (3 strategies via reusable bar — manual_value stays per-row)
 *   - conflict-type filter chips (local state, no URL sync)
 *   - visual diff panel (numbers + delta first; raw JSON moved into a
 *     <details> disclosure to avoid drowning everyday QLV usage)
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
  const [conflictTypeFilter, setConflictTypeFilter] =
    useState<ConflictTypeFilter>("all");
  const [bulkNote, setBulkNote] = useState("");
  const [isBulkPending, startBulk] = useTransition();

  const pending = rows.filter((r) => !r.resolvedAt);
  const resolved = rows.filter((r) => r.resolvedAt);

  const filteredPending = useMemo(() => {
    if (conflictTypeFilter === "all") return pending;
    return pending.filter((r) => r.conflictType === conflictTypeFilter);
  }, [pending, conflictTypeFilter]);

  const bulkSelection =
    useInventoryBulkSelection<StocktakeConflictRow>(filteredPending);

  function applyResolution(
    conflictId: number,
    partial: Partial<StocktakeConflictRow>,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === conflictId ? { ...r, ...partial } : r)),
    );
  }

  // Bulk handler — loops `Promise.allSettled` so one failure doesn't sink the
  // whole batch. Surfaces partial results via toast; rows that succeed are
  // optimistically marked resolved via `applyResolution` so the UI snaps.
  function handleBulkResolve(resolution: BulkResolution) {
    if (bulkSelection.selectedCount === 0) return;
    const items = bulkSelection.selectedItems;
    const note = bulkNote.trim();
    startBulk(async () => {
      const results = await Promise.allSettled(
        items.map((row) =>
          resolveStocktakeConflict({
            conflictId: row.id,
            resolution,
            note: note || undefined,
          }),
        ),
      );
      let okCount = 0;
      const failures: string[] = [];
      results.forEach((res, idx) => {
        const row = items[idx];
        if (!row) return;
        if (res.status === "fulfilled" && res.value.success && res.value.data) {
          okCount += 1;
          applyResolution(row.id, {
            resolvedAt: new Date().toISOString(),
            resolution: res.value.data.resolution as Resolution,
            resolutionQty: res.value.data.finalQty,
            resolutionNote: note || null,
          });
        } else {
          const reason =
            res.status === "fulfilled"
              ? (res.value.error ?? "lỗi không xác định")
              : (res.reason instanceof Error
                  ? res.reason.message
                  : "lỗi mạng");
          failures.push(`#${row.id}: ${reason}`);
        }
      });
      bulkSelection.clear();
      setBulkNote("");
      if (okCount === items.length) {
        toast.success(`Đã xử lý ${okCount} conflict.`);
      } else if (okCount === 0) {
        toast.error(failures[0] ?? "Không xử lý được conflict nào.");
      } else {
        toast.warning(
          `Đã xử lý ${okCount}/${items.length}. ${failures[0] ?? ""}`,
        );
      }
    });
  }

  // Detect clock_tamper rows in current selection — for warning when applying
  // client. Per design: WARN, do NOT block (QLV may have legitimate override).
  const clockTamperInSelection = useMemo(
    () =>
      bulkSelection.selectedItems.filter(
        (r) => r.conflictType === "clock_tamper",
      ).length,
    [bulkSelection.selectedItems],
  );

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
            <Link
              href={`/inventory/stocktake/conflicts?branchId=${branchId}&resolved=1`}
            >
              Bao gồm đã resolve
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => router.refresh()}
          >
            Làm mới
          </Button>
        </div>

        {/* Conflict-type filter chips (local state, no URL sync). Reset
            selection when changing filter to avoid hidden-but-still-selected
            rows confusing the bulk action. */}
        <div className="flex flex-wrap items-center gap-1 border bg-card px-2 py-1.5">
          <span className="px-1 text-xs text-muted-foreground">
            Loại lệch:
          </span>
          {FILTER_OPTIONS.map((opt) => {
            const active = conflictTypeFilter === opt.value;
            const optCount =
              opt.value === "all"
                ? pending.length
                : pending.filter((r) => r.conflictType === opt.value).length;
            return (
              <Button
                key={opt.value}
                type="button"
                size="xs"
                variant={active ? "default" : "outline"}
                onClick={() => {
                  if (conflictTypeFilter !== opt.value) {
                    bulkSelection.clear();
                  }
                  setConflictTypeFilter(opt.value);
                }}
              >
                {opt.label}
                <Badge variant="outline" className="ml-1 tabular-nums">
                  {optCount}
                </Badge>
              </Button>
            );
          })}
        </div>

        {filteredPending.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <IconCheck className="size-8 text-green-600" />
              <div className="text-sm font-medium">
                {pending.length === 0
                  ? "Không có conflict nào chờ xử lý"
                  : "Không có conflict trong bộ lọc"}
              </div>
              <div className="text-xs text-muted-foreground">
                {pending.length === 0
                  ? "Offline sync đang sạch — các round đều được accept trực tiếp."
                  : "Đổi bộ lọc khác để xem conflict còn lại."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredPending.map((row) => (
              <ConflictRow
                key={row.id}
                row={row}
                isSelected={bulkSelection.isSelected(row.id)}
                onToggleSelect={(value) =>
                  bulkSelection.setSelected(row.id, value)
                }
                onResolved={(patch) => applyResolution(row.id, patch)}
                disabled={isBulkPending}
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
                      {r.resolutionQty !== null
                        ? ` · ${r.resolutionQty}`
                        : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </InventoryPageContent>

      {bulkSelection.selectedCount > 0 ? (
        <InventoryBulkActionBar
          selectedCount={bulkSelection.selectedCount}
          itemNoun="conflict"
          isPending={isBulkPending}
          actions={[
            {
              key: "bulk-keep-server",
              label: `Giữ server (${bulkSelection.selectedCount})`,
              icon: IconArrowLeft,
              variant: "outline",
              onClick: () => handleBulkResolve("keep_server"),
            },
            {
              key: "bulk-apply-client",
              label: `Áp dụng client (${bulkSelection.selectedCount})`,
              icon: IconArrowRight,
              variant: "outline",
              onClick: () => handleBulkResolve("apply_client"),
            },
            {
              key: "bulk-reject",
              label: `Reject (${bulkSelection.selectedCount})`,
              icon: IconBan,
              variant: "ghost",
              onClick: () => handleBulkResolve("reject"),
            },
          ]}
          onClear={bulkSelection.clear}
          leftSlot={
            <div className="flex items-center gap-2">
              <Textarea
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value.slice(0, 200))}
                rows={1}
                placeholder="Ghi chú áp cho cả batch (tuỳ chọn)"
                disabled={isBulkPending}
                className="min-h-9 w-56 resize-none text-xs"
              />
              {clockTamperInSelection > 0 ? (
                <Badge variant="destructive" className="gap-1">
                  <IconWarning className="size-3" />
                  {clockTamperInSelection} dòng clock_tamper
                </Badge>
              ) : null}
            </div>
          }
        />
      ) : null}
    </>
  );
}

interface ConflictRowProps {
  row: StocktakeConflictRow;
  isSelected: boolean;
  onToggleSelect: (value: boolean) => void;
  onResolved: (patch: Partial<StocktakeConflictRow>) => void;
  disabled: boolean;
}

function ConflictRow({
  row,
  isSelected,
  onToggleSelect,
  onResolved,
  disabled,
}: ConflictRowProps) {
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
        manualQty:
          resolution === "manual_value" ? Number(manualQty) : undefined,
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

  const isBusy = pending || disabled;

  return (
    <Card data-slot="conflict-row" data-conflict-id={row.id}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(value) => onToggleSelect(value === true)}
              disabled={isBusy}
              aria-label={`Chọn conflict ${row.ingredientName}`}
              className="mt-1"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <IconAlertOctagon className="size-4 text-red-600" />
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
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-orange-300 bg-orange-50 text-orange-900",
                  )}
                >
                  {CONFLICT_TYPE_VI[row.conflictType]}
                </Badge>
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <IconClock className="size-3.5" />
                Submit lúc {formatDateTime(row.submittedAt)}
                {row.submittedBy
                  ? ` · bởi ${truncateUid(row.submittedBy)}`
                  : null}
              </div>
            </div>
          </div>
        </div>

        <ConflictDiffPanel
          serverQty={serverQty}
          clientQty={clientQty}
          serverPayload={row.serverPayload}
          clientPayload={row.clientPayload}
        />

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
              disabled={isBusy || manualQty === ""}
            >
              <IconCheck className="size-4" /> Xác nhận thủ công
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowManual(false)}
              disabled={isBusy}
            >
              Huỷ
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submit("keep_server")}
              disabled={isBusy || !Number.isFinite(serverQty)}
            >
              <IconArrowLeft className="size-4" /> Giữ server
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => submit("apply_client")}
              disabled={isBusy || !Number.isFinite(clientQty)}
            >
              <IconArrowRight className="size-4" /> Áp dụng client
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowManual(true)}
              disabled={isBusy}
            >
              <IconPencil className="size-4" /> Thủ công
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => submit("reject")}
              disabled={isBusy}
            >
              <IconBan className="size-4" /> Reject (không đổi)
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Side-by-side server vs client diff. Surfaces qty + delta first; raw JSON
 * stays available behind a `<details>` disclosure for engineers and audits.
 */
function ConflictDiffPanel({
  serverQty,
  clientQty,
  serverPayload,
  clientPayload,
}: {
  serverQty: number;
  clientQty: number;
  serverPayload: Record<string, unknown> | null;
  clientPayload: Record<string, unknown> | null;
}) {
  const haveBoth = Number.isFinite(serverQty) && Number.isFinite(clientQty);
  const delta = haveBoth ? clientQty - serverQty : null;
  const deltaPct =
    haveBoth && serverQty !== 0 ? (delta! / serverQty) * 100 : null;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-blue-200 bg-blue-50/40 p-3 text-xs">
          <div className="font-medium text-blue-900">Server đang giữ</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {Number.isFinite(serverQty) ? serverQty : "—"}
          </div>
        </div>
        <div className="rounded-md border border-orange-200 bg-orange-50/40 p-3 text-xs">
          <div className="font-medium text-orange-900">Client offline submit</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {Number.isFinite(clientQty) ? clientQty : "—"}
          </div>
        </div>
      </div>

      {delta != null ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Δ (client − server):</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              delta > 0 && "text-red-700",
              delta < 0 && "text-blue-700",
              delta === 0 && "text-muted-foreground",
            )}
          >
            {delta > 0 ? "+" : ""}
            {delta}
            {deltaPct !== null
              ? ` (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`
              : ""}
          </span>
        </div>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Xem payload đầy đủ (debug)
        </summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(serverPayload ?? {}, null, 2)}
          </pre>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/30 p-2 text-[11px]">
            {JSON.stringify(clientPayload ?? {}, null, 2)}
          </pre>
        </div>
      </details>
    </div>
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
      return "border-blue-300 text-blue-900";
    case "apply_client":
      return "border-orange-300 text-orange-900";
    case "manual_value":
      return "border-purple-300 text-purple-900";
    case "reject":
      return "border-slate-300 text-slate-700";
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
