/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory count review management copy */
"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  RotateCcw as IconRecount,
  Trash2 as IconTrash,
  Zap as IconZap,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import {
  ACTIONS_VI,
  INVENTORY_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import {
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import type {
  CountSlipLineView as CountSlipLine,
  CountSlipRow,
  CountSlipStatus,
} from "@lib/inventory/count-slip-model";
import { formatQty } from "@lib/inventory/format";
import { inventoryListFilterSelectClassName } from "../_components/inventory-list-filters";
import { approveCountSlip, requestCountRecount } from "./actions";

type QueueView = "pending" | "history" | "all";

function formatVariance(value: number | null): string {
  if (value === null) return "—";
  const formatted = formatQty(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function varianceClassName(value: number | null): string {
  if (value === null) return "text-muted-foreground";
  if (value < 0) return "text-destructive";
  if (value > 0) return "text-warning";
  return "text-muted-foreground";
}

function summarizeVariance(row: CountSlipRow) {
  const knownLines = row.lines.filter(
    (line): line is CountSlipLine & { variance: number } =>
      line.variance !== null,
  );
  const total = knownLines.reduce((sum, line) => sum + line.variance, 0);
  const units = new Set(
    knownLines.map((line) => line.varianceUnit).filter(Boolean),
  );
  const unit = units.size === 1 ? (units.values().next().value ?? "") : "";
  const changedLineCount = knownLines.filter(
    (line) => line.variance !== 0,
  ).length;
  return {
    total,
    unit,
    changedLineCount,
    showTotal: knownLines.length === row.lines.length && unit !== "",
  };
}

function renderSlipMobileRow(row: CountSlipRow, onOpen: () => void) {
  const variance = summarizeVariance(row);
  return (
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-stretch p-0 text-left"
      aria-label={`Xem phiếu đếm ${row.slipNumber} của ${row.employeeName}`}
      onClick={onOpen}
    >
      <Item variant="outline" className="items-start">
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ItemTitle className="min-w-0 truncate font-mono tabular-nums">
              {row.slipNumber}
            </ItemTitle>
            <StatusBadge domain="count-slip" value={row.status} />
          </div>
          <ItemDescription className="truncate">{row.employeeName}</ItemDescription>
          <ItemDescription className="break-words">
            {row.branchName} · {row.locationName}
            {row.shiftName ? ` · ${row.shiftName}` : ""}
          </ItemDescription>
          <ItemDescription>
            {INVENTORY_VI.countDateAt(formatVNDate(row.countDate))} ·{" "}
            {INVENTORY_VI.grnDraftLineCount(row.lines.length)}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <span
            className={cn(
              "font-mono text-sm font-semibold tabular-nums",
              varianceClassName(variance.total),
            )}
          >
            {variance.showTotal
              ? `${formatVariance(variance.total)} ${variance.unit}`
              : INVENTORY_VI.varianceLineCount(variance.changedLineCount)}
          </span>
        </ItemActions>
      </Item>
    </Button>
  );
}

export function CountSlipsClient({
  initial,
  initialSlipId = null,
}: {
  initial: CountSlipRow[];
  initialSlipId?: number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const controlSize = useFormControlSize("responsive");
  const [rows, setRows] = useState(initial);
  const rawQueue = searchParams.get("queue");
  const queueView: QueueView =
    rawQueue === "history" || rawQueue === "all" || rawQueue === "pending"
      ? rawQueue
      : "pending";
  const [selectedSlipId, setSelectedSlipId] = useState<number | null>(
    initialSlipId,
  );

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const replaceListParams = useCallback(
    (patch: { slipId?: number | null; queue?: QueueView | null }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (patch.slipId !== undefined) {
        if (patch.slipId == null) next.delete("slipId");
        else next.set("slipId", String(patch.slipId));
      }
      if (patch.queue !== undefined) {
        if (patch.queue == null || patch.queue === "pending") {
          next.delete("queue");
        } else {
          next.set("queue", patch.queue);
        }
      }
      const query = next.toString();
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router, searchParams, startTransition],
  );

  const replaceSlipId = useCallback(
    (slipId: number | null) => {
      replaceListParams({ slipId });
    },
    [replaceListParams],
  );

  const setQueueView = useCallback(
    (value: QueueView) => {
      replaceListParams({ queue: value });
    },
    [replaceListParams],
  );

  useEffect(() => {
    const raw = searchParams.get("slipId");
    if (raw == null || raw === "") {
      setSelectedSlipId(null);
      return;
    }
    const parsed = Number(raw);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      setSelectedSlipId(null);
      replaceSlipId(null);
      return;
    }
    const exists = rows.some((row) => row.id === parsed);
    if (!exists) {
      setSelectedSlipId(null);
      replaceSlipId(null);
      return;
    }
    setSelectedSlipId(parsed);
  }, [replaceSlipId, rows, searchParams]);

  const openSlip = useCallback(
    (slipId: number) => {
      setSelectedSlipId(slipId);
      replaceSlipId(slipId);
    },
    [replaceSlipId],
  );

  const closeSlip = useCallback(() => {
    setSelectedSlipId(null);
    replaceSlipId(null);
  }, [replaceSlipId]);

  const { pending, history } = useMemo(() => {
    const pendingRows: CountSlipRow[] = [];
    const historyRows: CountSlipRow[] = [];
    for (const row of rows) {
      if (row.status === "submitted") pendingRows.push(row);
      else historyRows.push(row);
    }
    return { pending: pendingRows, history: historyRows };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (queueView === "pending") return pending;
    if (queueView === "history") return history;
    return rows;
  }, [history, pending, queueView, rows]);

  const selectedRow =
    selectedSlipId === null
      ? null
      : (rows.find((row) => row.id === selectedSlipId) ?? null);

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((current) =>
      current.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
    closeSlip();
  }

  const columns: DataTableColumn<CountSlipRow>[] = [
    {
      key: "code",
      header: "Mã phiếu",
      className: "w-36 font-mono text-sm tabular-nums",
      render: (row) => row.slipNumber,
    },
    {
      key: "employee",
      header: "Nhân viên",
      className: "min-w-48",
      render: (row) => (
        <div>
          <div className="font-medium">{row.employeeName}</div>
          {row.shiftName ? (
            <div className="text-xs text-muted-foreground">{row.shiftName}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: "scope",
      header: "Chi nhánh / kho",
      className: "min-w-56",
      render: (row) => (
        <div>
          <div>{row.branchName}</div>
          <div className="text-xs text-muted-foreground">
            {row.locationName}
          </div>
        </div>
      ),
    },
    {
      key: "date",
      header: "Ngày đếm",
      className: "w-40",
      render: (row) => (
        <div>
          <div>{formatVNDate(row.countDate)}</div>
          {row.submittedAt ? (
            <div className="text-xs text-muted-foreground">
              {formatVNDateTime(row.submittedAt)}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "lines",
      header: "Số dòng",
      className: "w-24 text-right",
      render: (row) => (
        <span className="block font-mono tabular-nums text-right">
          {row.lines.length}
        </span>
      ),
    },
    {
      key: "variance",
      header: "Chênh lệch",
      className: "w-40 text-right",
      render: (row) => {
        const variance = summarizeVariance(row);
        return (
          <span
            className={cn(
              "block font-mono tabular-nums text-right",
              varianceClassName(variance.total),
            )}
          >
            {variance.showTotal
              ? `${formatVariance(variance.total)} ${variance.unit}`
              : INVENTORY_VI.varianceLineCount(variance.changedLineCount)}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-36",
      render: (row) => <StatusBadge domain="count-slip" value={row.status} />,
    },
  ];

  const emptyTitle =
    queueView === "history"
      ? "Chưa có lịch sử phiếu đếm"
      : INVENTORY_VI.countSlipEmptyTitle;
  const emptyDescription =
    queueView === "history"
      ? "Phiếu đã duyệt hoặc yêu cầu đếm lại sẽ xuất hiện tại đây."
      : INVENTORY_VI.countSlipEmptyDescription;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={INVENTORY_VI.countSlipTitle}
        actions={
          <Button
            variant="outline"
            size={controlSize === "touch" ? "touch" : "lg"}
            render={<Link href="/inventory/count-assignments" />}
          >
            <IconClipboardList aria-hidden="true" />
            {INVENTORY_VI.countAssignTitle}
          </Button>
        }
        badge={{
          children: INVENTORY_VI.countSlipPendingBadge(pending.length),
          variant: pending.length > 0 ? "warning" : "secondary",
        }}
      />

      <AppListFrame
        toolbar={
          <AppToolbar
            variant="inline"
            filters={
              <Select
                value={queueView}
                onValueChange={(value) => setQueueView(value as QueueView)}
              >
                <SelectTrigger
                  size={controlSize}
                  className={inventoryListFilterSelectClassName}
                  aria-label="Lọc hàng đợi phiếu đếm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">
                    Chờ duyệt ({pending.length})
                  </SelectItem>
                  <SelectItem value="history">
                    {INVENTORY_VI.countSlipHistoryTitle} ({history.length})
                  </SelectItem>
                  <SelectItem value="all">Tất cả ({rows.length})</SelectItem>
                </SelectContent>
              </Select>
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={visibleRows}
          pageSize={50}
          getRowKey={(row) => row.id}
          onRowClick={(row) => openSlip(row.id)}
          getRowAriaLabel={(row) =>
            `Xem phiếu đếm ${row.slipNumber} của ${row.employeeName}`
          }
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          emptyIcon={<IconClipboardCheck />}
          mobileCardRender={(row) =>
            renderSlipMobileRow(row, () => openSlip(row.id))
          }
        />
      </AppListFrame>

      <CountSlipReviewDialog
        row={selectedRow}
        onClose={closeSlip}
        onStatusChange={applyStatus}
      />
    </AppPage>
  );
}

function CountSlipReviewDialog({
  row,
  onClose,
  onStatusChange,
}: {
  row: CountSlipRow | null;
  onClose: () => void;
  onStatusChange: (slipId: number, status: CountSlipStatus) => void;
}) {
  const router = useRouter();
  const [recounting, setRecounting] = useState(false);
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "approve" | "recount" | null
  >(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setRecounting(false);
    setNote("");
    setPendingAction(null);
  }, [row?.id]);

  if (row === null) return null;
  const activeRow = row;
  const variance = summarizeVariance(activeRow);
  const readOnly = activeRow.status !== "submitted";

  async function handleApprove() {
    const accepted = await confirm({
      title: INVENTORY_VI.countSlipApproveTitle,
      description: INVENTORY_VI.countSlipApproveDescription,
      details: [
        { label: "Mã phiếu", value: activeRow.slipNumber },
        { label: STAFF_VI.long, value: activeRow.employeeName },
        {
          label: INVENTORY_VI.warehouseShort,
          value: activeRow.locationName,
        },
        {
          label: INVENTORY_VI.lineCountLabel,
          value: INVENTORY_VI.ingredientCountBadge(activeRow.lines.length),
        },
      ],
      confirmText: ACTIONS_VI.approve,
      variant: "destructive",
    });
    if (!accepted) return;

    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveCountSlip({ slipId: activeRow.id });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.countSlipApproveFailed);
        return;
      }
      toast.success(INVENTORY_VI.countSlipApproved);
      onStatusChange(activeRow.id, "approved");
      router.refresh();
    });
  }

  function handleRecount() {
    if (note.trim().length < 3) {
      toast.error(INVENTORY_VI.recountReasonRequired);
      return;
    }
    setPendingAction("recount");
    startTransition(async () => {
      const result = await requestCountRecount({
        slipId: activeRow.id,
        note,
      });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.recountRequestFailed);
        return;
      }
      toast.success(INVENTORY_VI.recountRequested);
      onStatusChange(activeRow.id, "needs_changes");
      router.refresh();
    });
  }

  const lineColumns: DataTableColumn<CountSlipLine>[] = [
    {
      key: "ingredient",
      header: "Nguyên liệu",
      className: "min-w-56",
      render: (line) => (
        <div>
          <div className="font-medium">{line.ingredientName}</div>
          {line.note ? (
            <div className="max-w-md break-words text-xs italic text-muted-foreground">
              {line.note}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "system",
      header: "Tồn lúc nộp",
      className: "w-40 text-right",
      render: (line) => (
        <div className="whitespace-nowrap text-right font-mono tabular-nums">
          <div>
            {formatQty(line.systemQuantity)} {line.systemUnit}
          </div>
          {line.currentLiveQuantity !== null ? (
            <div className="text-xs text-muted-foreground">
              {INVENTORY_VI.liveStockColon} {formatQty(line.currentLiveQuantity)}{" "}
              {line.systemUnit}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "counted",
      header: "Thực đếm",
      className: "w-40 text-right",
      render: (line) => (
        <div className="whitespace-nowrap text-right font-mono tabular-nums">
          {formatQty(line.countedQuantity)} {line.countedUnit}
          {line.countedBaseQuantity !== null &&
          line.countedUnit !== line.systemUnit ? (
            <div className="text-xs text-muted-foreground">
              {formatQty(line.countedBaseQuantity)} {line.systemUnit}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "variance",
      header: "Chênh lệch",
      className: "w-40 text-right",
      render: (line) => (
        <span
          className={cn(
            "block whitespace-nowrap text-right font-mono tabular-nums",
            varianceClassName(line.variance),
          )}
        >
          {formatVariance(line.variance)}
          {line.variance !== null ? ` ${line.varianceUnit}` : ""}
        </span>
      ),
    },
  ];

  const controlSize = useFormControlSize("responsive");

  const footer = readOnly ? (
    <Button
      type="button"
      variant="outline"
      size={controlSize === "touch" ? "touch" : "default"}
      className="w-full sm:w-auto"
      onClick={onClose}
    >
      {ACTIONS_VI.close}
    </Button>
  ) : recounting ? (
    <div className="flex w-full gap-2 sm:w-auto">
      <Button
        type="button"
        variant="outline"
        size={controlSize === "touch" ? "touch" : "default"}
        className="flex-1 sm:flex-initial"
        disabled={pendingAction !== null}
        onClick={() => {
          setRecounting(false);
          setNote("");
        }}
      >
        {ACTIONS_VI.cancel}
      </Button>
      <Button
        type="button"
        size={controlSize === "touch" ? "touch" : "default"}
        className="flex-1 sm:flex-initial font-semibold"
        disabled={pendingAction !== null}
        onClick={handleRecount}
      >
        {pendingAction === "recount" ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconRecount aria-hidden="true" />
        )}
        {INVENTORY_VI.sendRecountRequest}
      </Button>
    </div>
  ) : (
    <div className="flex w-full gap-2 sm:w-auto">
      <Button
        type="button"
        variant="outline"
        size={controlSize === "touch" ? "touch" : "default"}
        className="flex-1 sm:flex-initial"
        disabled={pendingAction !== null}
        onClick={() => setRecounting(true)}
      >
        <IconRecount aria-hidden="true" />
        {INVENTORY_VI.requestRecount}
      </Button>
      <Button
        type="button"
        size={controlSize === "touch" ? "touch" : "default"}
        className="flex-1 sm:flex-initial font-semibold"
        disabled={pendingAction !== null}
        onClick={() => void handleApprove()}
      >
        {pendingAction === "approve" ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <IconCheck aria-hidden="true" />
        )}
        {ACTIONS_VI.approve}
      </Button>
    </div>
  );

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open && pendingAction === null) onClose();
      }}
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono tabular-nums">{activeRow.slipNumber}</span>
          <StatusBadge domain="count-slip" value={activeRow.status} />
        </div>
      }
      description={
        <span className="break-words">
          {activeRow.employeeName} · {activeRow.branchName} ·{" "}
          {activeRow.locationName}
          {activeRow.shiftName ? ` · ${activeRow.shiftName}` : ""} ·{" "}
          {INVENTORY_VI.countDateAt(formatVNDate(activeRow.countDate))}
        </span>
      }
      contentClassName="max-h-dvh-95 flex flex-col sm:max-w-5xl"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain"
      footer={footer}
    >
      <Frame className="min-h-48 max-h-96 min-h-0 overflow-hidden sm:h-96">
        <ScrollArea className="h-full">
          <DataTable
            columns={lineColumns}
            data={activeRow.lines}
            getRowKey={(line) => line.id}
            emptyTitle="Phiếu chưa có dòng kiểm đếm"
            mobileCardRender={(line) => (
              <Item variant="muted" className="items-start">
                <ItemContent className="min-w-0">
                  <ItemTitle className="break-words">
                    {line.ingredientName}
                  </ItemTitle>
                  <ItemDescription>
                    Hệ thống: {formatQty(line.systemQuantity)} {line.systemUnit}
                  </ItemDescription>
                  <ItemDescription>
                    Thực đếm: {formatQty(line.countedQuantity)}{" "}
                    {line.countedUnit}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span
                    className={cn(
                      "font-mono font-semibold tabular-nums",
                      varianceClassName(line.variance),
                    )}
                  >
                    {formatVariance(line.variance)}
                    {line.variance !== null ? ` ${line.varianceUnit}` : ""}
                  </span>
                </ItemActions>
              </Item>
            )}
          />
        </ScrollArea>
      </Frame>

      {variance.changedLineCount > 0 ? (
        <NoteCallout
          tone="muted"
          icon={<IconZap className="size-4 text-primary" />}
          label={INVENTORY_VI.varianceActionsTitle}
          className="flex-col items-stretch gap-1.5"
        >
          <p className="text-xs text-muted-foreground">
            {INVENTORY_VI.varianceActionsHint}
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {activeRow.lines.some(
              (l) => l.variance !== null && l.variance < 0,
            ) ? (
              <Button
                type="button"
                variant="outline"
                render={
                  <Link
                    href={`/inventory/waste/new?sourceSlipId=${activeRow.id}`}
                  />
                }
              >
                <IconTrash className="size-3.5 text-destructive" />
                {INVENTORY_VI.createWasteShortageAction}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              render={<Link href="/inventory/stocktake/new" />}
            >
              <IconClipboardCheck className="size-3.5 text-primary" />
              {INVENTORY_VI.createStocktakeAction}
            </Button>
          </div>
        </NoteCallout>
      ) : null}

      <div className="grid gap-2 text-sm sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="flex min-w-0 flex-col gap-1">
          {activeRow.note ? (
            <p className="break-words italic text-muted-foreground">
              {INVENTORY_VI.employeeNoteLine(activeRow.note)}
            </p>
          ) : null}
          {activeRow.reviewNote ? (
            <p className="break-words italic text-warning">
              {INVENTORY_VI.recountReasonLine(activeRow.reviewNote)}
            </p>
          ) : null}
        </div>
        <div
          className={cn(
            "font-mono font-semibold tabular-nums sm:text-right",
            varianceClassName(variance.total),
          )}
        >
          {variance.showTotal
            ? INVENTORY_VI.totalVarianceSummary(
                formatVariance(variance.total),
                variance.unit,
              )
            : INVENTORY_VI.varianceLineCount(variance.changedLineCount)}
        </div>
      </div>

      {!readOnly && recounting ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="count-slip-recount-note">
            {INVENTORY_VI.recountReasonLabel}
          </Label>
          <Textarea
            id="count-slip-recount-note"
            name="count-slip-recount-note"
            autoComplete="off"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pendingAction !== null}
            rows={3}
            placeholder={INVENTORY_VI.recountReasonPlaceholder}
          />
        </div>
      ) : null}
    </AppDialog>
  );
}
