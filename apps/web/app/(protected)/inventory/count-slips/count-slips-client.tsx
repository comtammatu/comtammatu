/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory count review management copy */
"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  ClipboardList as IconClipboardList,
  RotateCcw as IconRecount,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
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
import { AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import type {
  CountSlipLineView as CountSlipLine,
  CountSlipRow,
  CountSlipStatus,
} from "@lib/inventory/count-slip-model";
import { formatQty } from "@lib/inventory/format";
import { approveCountSlip, requestCountRecount } from "./actions";

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
      aria-label={`Xem phiếu đếm của ${row.employeeName}`}
      onClick={onOpen}
    >
      <Item variant="outline" className="items-start">
        <ItemContent className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <ItemTitle className="min-w-0 truncate">
              {row.employeeName}
            </ItemTitle>
            <StatusBadge domain="count-slip" value={row.status} />
          </div>
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

export function CountSlipsClient({ initial }: { initial: CountSlipRow[] }) {
  const [rows, setRows] = useState(initial);
  const [selectedSlipId, setSelectedSlipId] = useState<number | null>(null);

  useEffect(() => {
    setRows(initial);
  }, [initial]);

  const { pending, history } = useMemo(() => {
    const pendingRows: CountSlipRow[] = [];
    const historyRows: CountSlipRow[] = [];
    for (const row of rows) {
      if (row.status === "submitted") pendingRows.push(row);
      else historyRows.push(row);
    }
    return { pending: pendingRows, history: historyRows };
  }, [rows]);
  const selectedRow =
    selectedSlipId === null
      ? null
      : (rows.find((row) => row.id === selectedSlipId) ?? null);

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((current) =>
      current.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
    setSelectedSlipId(null);
  }

  const columns: DataTableColumn<CountSlipRow>[] = [
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
              "block font-mono font-semibold tabular-nums text-right",
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

  function renderTable(data: CountSlipRow[], historyTable = false) {
    return (
      <DataTable
        columns={columns}
        data={data}
        getRowKey={(row) => row.id}
        onRowClick={(row) => setSelectedSlipId(row.id)}
        getRowAriaLabel={(row) => `Xem phiếu đếm của ${row.employeeName}`}
        emptyTitle={
          historyTable
            ? "Chưa có lịch sử phiếu đếm"
            : INVENTORY_VI.countSlipEmptyTitle
        }
        emptyDescription={
          historyTable
            ? "Phiếu đã duyệt hoặc yêu cầu đếm lại sẽ xuất hiện tại đây."
            : INVENTORY_VI.countSlipEmptyDescription
        }
        emptyIcon={<IconClipboardCheck />}
        mobileCardRender={(row) =>
          renderSlipMobileRow(row, () => setSelectedSlipId(row.id))
        }
      />
    );
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={INVENTORY_VI.countSlipTitle}
        description={INVENTORY_VI.countSlipDescription}
        actions={
          <Button
            variant="outline"
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

      <section className="flex flex-col gap-3" aria-labelledby="pending-slips">
        <h2 id="pending-slips" className="font-heading text-base font-semibold">
          Chờ duyệt
        </h2>
        {renderTable(pending)}
      </section>

      {history.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="slip-history">
          <h2
            id="slip-history"
            className="font-heading text-base font-semibold"
          >
            {INVENTORY_VI.countSlipHistoryTitle}
          </h2>
          {renderTable(history, true)}
        </section>
      ) : null}

      <CountSlipReviewDialog
        row={selectedRow}
        onClose={() => setSelectedSlipId(null)}
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
      toast.success(
        result.data && result.data.adjustedLines > 0
          ? INVENTORY_VI.countSlipApprovedAdjusted(result.data.adjustedLines)
          : INVENTORY_VI.countSlipApproved,
      );
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
      header: "Hệ thống",
      className: "w-40 text-right",
      render: (line) => (
        <span className="block whitespace-nowrap text-right font-mono tabular-nums">
          {formatQty(line.systemQuantity)} {line.systemUnit}
        </span>
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
            "block whitespace-nowrap text-right font-mono font-semibold tabular-nums",
            varianceClassName(line.variance),
          )}
        >
          {formatVariance(line.variance)}
          {line.variance !== null ? ` ${line.varianceUnit}` : ""}
        </span>
      ),
    },
  ];

  const footer = readOnly ? (
    <Button type="button" variant="outline" onClick={onClose}>
      {ACTIONS_VI.close}
    </Button>
  ) : recounting ? (
    <>
      <Button
        type="button"
        variant="outline"
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
    </>
  ) : (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pendingAction !== null}
        onClick={() => setRecounting(true)}
      >
        <IconRecount aria-hidden="true" />
        {INVENTORY_VI.requestRecount}
      </Button>
      <Button
        type="button"
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
    </>
  );

  return (
    <AppDialog
      open
      onOpenChange={(open) => {
        if (!open && pendingAction === null) onClose();
      }}
      title={
        <div className="flex flex-wrap items-center gap-2">
          <span>{activeRow.employeeName}</span>
          <StatusBadge domain="count-slip" value={activeRow.status} />
        </div>
      }
      description={
        <span className="break-words">
          {activeRow.branchName} · {activeRow.locationName}
          {activeRow.shiftName ? ` · ${activeRow.shiftName}` : ""} ·{" "}
          {INVENTORY_VI.countDateAt(formatVNDate(activeRow.countDate))}
        </span>
      }
      contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-5xl"
      bodyClassName="min-h-0 overflow-hidden"
      footer={footer}
    >
      <Frame className="h-96 min-h-0 overflow-hidden">
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
