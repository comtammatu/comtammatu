"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  RotateCcw as IconRecount,
} from "lucide-react";
import {
  ACTIONS_VI,
  INVENTORY_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorDetailList,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import { useOperatorUrlState } from "@lib/branch-operator/use-operator-url-state";
import {
  approveCountSlip,
  requestCountRecount,
} from "@/(protected)/inventory/count-slips/actions";
import { formatQty } from "@/(protected)/inventory/_lib/format";
import type {
  CountSlipLineView,
  CountSlipRow,
  CountSlipStatus,
} from "@lib/inventory/count-slip-model";

type QueueView = "pending" | "history";

function formatVariance(value: number | null): string {
  if (value == null) return "—";
  const formatted = formatQty(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `−${formatted}`;
  return formatted;
}

function varianceClassName(value: number | null): string {
  if (value == null || value === 0) return "text-muted-foreground";
  return value < 0 ? "text-destructive" : "text-warning";
}

function changedLineCount(row: CountSlipRow): number {
  return row.lines.filter(
    (line) => line.variance != null && line.variance !== 0,
  ).length;
}

export function BranchCountSlipsClient({
  branchName,
  initialRows,
  loadFailed,
  focusFirstPending,
}: {
  branchName: string;
  initialRows: CountSlipRow[];
  loadFailed: boolean;
  focusFirstPending: boolean;
}) {
  const router = useRouter();
  const { replaceParams, searchParams } = useOperatorUrlState();
  const [rows, setRows] = useState(initialRows);
  const view: QueueView =
    searchParams.get("view") === "history" ? "history" : "pending";
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    focusFirstPending
      ? (initialRows.find((row) => row.status === "submitted")?.id ?? null)
      : null,
  );
  const [recounting, setRecounting] = useState(false);
  const [recountNote, setRecountNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "approve" | "recount" | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const pendingRows = useMemo(
    () => rows.filter((row) => row.status === "submitted"),
    [rows],
  );
  const historyRows = useMemo(
    () => rows.filter((row) => row.status !== "submitted"),
    [rows],
  );
  const visibleRows = view === "pending" ? pendingRows : historyRows;
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => setRows(initialRows), [initialRows]);

  function closeReview() {
    setSelectedId(null);
    setRecounting(false);
    setRecountNote("");
    setPendingAction(null);
  }

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((current) =>
      current.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
  }

  async function approveSelected() {
    if (!selected) return;
    const ok = await confirm({
      title: INVENTORY_VI.countSlipApproveTitle,
      description: INVENTORY_VI.countSlipApproveDescription,
      details: [
        { label: STAFF_VI.long, value: selected.employeeName },
        { label: INVENTORY_VI.warehouseShort, value: selected.locationName },
        {
          label: INVENTORY_VI.lineCountLabel,
          value: INVENTORY_VI.ingredientCountBadge(selected.lines.length),
        },
      ],
      confirmText: ACTIONS_VI.approve,
      variant: "destructive",
    });
    if (!ok) return;
    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveCountSlip({ slipId: selected.id });
      setPendingAction(null);
      if (!result.success || !result.data) {
        toast.error(result.error ?? INVENTORY_VI.countSlipApproveFailed);
        return;
      }
      toast.success(
        result.data.adjustedLines > 0
          ? INVENTORY_VI.countSlipApprovedAdjusted(result.data.adjustedLines)
          : INVENTORY_VI.countSlipApproved,
      );
      applyStatus(selected.id, "approved");
      closeReview();
      router.refresh();
    });
  }

  function requestRecount() {
    if (!selected) return;
    if (recountNote.trim().length < 3) {
      toast.error(INVENTORY_VI.recountReasonRequired);
      return;
    }
    setPendingAction("recount");
    startTransition(async () => {
      const result = await requestCountRecount({
        slipId: selected.id,
        note: recountNote,
      });
      setPendingAction(null);
      if (!result.success) {
        toast.error(result.error ?? INVENTORY_VI.recountRequestFailed);
        return;
      }
      toast.success(INVENTORY_VI.recountRequested);
      applyStatus(selected.id, "needs_changes");
      closeReview();
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={INVENTORY_VI.countSlipTitle}
      description={branchName}
    >
      <Tabs
        value={view}
        onValueChange={(value) =>
          replaceParams({ view: value === "pending" ? null : value })
        }
      >
        <TabsList className="grid min-h-12 w-full grid-cols-2">
          <TabsTrigger value="pending" className="min-h-11">
            {INVENTORY_VI.countSlipPendingBadge(pendingRows.length)}
          </TabsTrigger>
          <TabsTrigger value="history" className="min-h-11">
            {INVENTORY_VI.countSlipHistoryTitle}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <section
        aria-label={
          view === "pending"
            ? INVENTORY_VI.countSlipTitle
            : INVENTORY_VI.countSlipHistoryTitle
        }
      >
        {loadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            icon={<IconClipboardCheck />}
            title={INVENTORY_VI.countSlipLoadFailed}
          >
            <Button size="touch" onClick={() => router.refresh()}>
              {ACTIONS_VI.retry}
            </Button>
          </AppEmptyState>
        ) : visibleRows.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-data"
            icon={<IconClipboardCheck />}
            title={INVENTORY_VI.countSlipEmptyTitle}
            description={INVENTORY_VI.countSlipEmptyDescription}
          />
        ) : (
          <ItemGroup className="grid gap-2 md:grid-cols-2">
            {visibleRows.map((row) => (
              <Item
                key={row.id}
                asChild
                variant="outline"
                className="min-h-20 touch-manipulation"
              >
                <button type="button" onClick={() => setSelectedId(row.id)}>
                  <ItemContent className="min-w-0 gap-1 text-left">
                    <ItemTitle size="heading">{row.employeeName}</ItemTitle>
                    <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>{row.locationName}</span>
                      {row.shiftName ? <span>{row.shiftName}</span> : null}
                      <span>{formatVNDate(row.countDate)}</span>
                    </ItemDescription>
                    <ItemDescription className="line-clamp-none">
                      {INVENTORY_VI.grnDraftLineCount(row.lines.length)} ·{" "}
                      {INVENTORY_VI.varianceLineCount(changedLineCount(row))}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <StatusBadge
                      domain="count-slip"
                      value={row.status}
                      size="sm"
                    />
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </button>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
      >
        <SheetContent
          side="bottom"
          className="max-h-dvh-95 overflow-hidden bg-background p-0"
        >
          {selected ? (
            <>
              <SheetHeader className="shrink-0">
                <SheetTitle>{selected.employeeName}</SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{selected.locationName}</span>
                  {selected.shiftName ? (
                    <span>{selected.shiftName}</span>
                  ) : null}
                  <StatusBadge
                    domain="count-slip"
                    value={selected.status}
                    size="sm"
                  />
                </div>
              </SheetHeader>
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
                <BranchOperatorDetailList
                  columns={2}
                  rows={[
                    {
                      label: INVENTORY_VI.countDateLabel,
                      value: formatVNDate(selected.countDate),
                    },
                    {
                      label: INVENTORY_VI.lineCountLabel,
                      value: selected.lines.length,
                    },
                    {
                      label: INVENTORY_VI.submittedAtLabel,
                      value: selected.submittedAt
                        ? formatVNDateTime(selected.submittedAt)
                        : "—",
                    },
                    {
                      label: INVENTORY_VI.varianceShort,
                      value: INVENTORY_VI.varianceLineCount(
                        changedLineCount(selected),
                      ),
                    },
                  ]}
                />

                <ItemGroup className="gap-2">
                  {selected.lines.map((line) => (
                    <CountSlipLineItem key={line.id} line={line} />
                  ))}
                </ItemGroup>

                {selected.note ? (
                  <p className="break-words text-sm italic text-muted-foreground">
                    {INVENTORY_VI.employeeNoteLine(selected.note)}
                  </p>
                ) : null}
                {selected.reviewNote ? (
                  <p className="break-words text-sm italic text-warning">
                    {INVENTORY_VI.recountReasonLine(selected.reviewNote)}
                  </p>
                ) : null}

                {recounting ? (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="branch-count-slip-recount-note">
                      {INVENTORY_VI.recountReasonLabel}
                    </Label>
                    <Textarea
                      id="branch-count-slip-recount-note"
                      name="recountNote"
                      rows={3}
                      maxLength={1000}
                      value={recountNote}
                      disabled={isPending}
                      onChange={(event) => setRecountNote(event.target.value)}
                      placeholder={INVENTORY_VI.recountReasonPlaceholder}
                    />
                  </div>
                ) : null}
              </div>
              <SheetFooter className="workflow-safe-pb shrink-0 bg-background/95 backdrop-blur">
                {selected.status === "submitted" ? (
                  recounting ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending}
                        onClick={() => {
                          setRecounting(false);
                          setRecountNote("");
                        }}
                      >
                        {ACTIONS_VI.cancel}
                      </Button>
                      <Button
                        type="button"
                        size="touch-lg"
                        disabled={isPending || recountNote.trim().length < 3}
                        onClick={requestRecount}
                      >
                        {pendingAction === "recount" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconRecount className="size-4" />
                        )}
                        {INVENTORY_VI.sendRecountRequest}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending}
                        onClick={() => setRecounting(true)}
                      >
                        <IconRecount className="size-4" />
                        {INVENTORY_VI.requestRecount}
                      </Button>
                      <Button
                        type="button"
                        size="touch-lg"
                        disabled={isPending}
                        onClick={() => void approveSelected()}
                      >
                        {pendingAction === "approve" ? (
                          <Spinner className="size-5" />
                        ) : (
                          <IconCheck className="size-4" />
                        )}
                        {ACTIONS_VI.approve}
                      </Button>
                    </>
                  )
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    onClick={closeReview}
                  >
                    {ACTIONS_VI.close}
                  </Button>
                )}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </BranchOperatorPage>
  );
}

function CountSlipLineItem({ line }: { line: CountSlipLineView }) {
  return (
    <Item variant="muted" className="min-h-20 items-start">
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle>{line.ingredientName}</ItemTitle>
        <ItemDescription className="line-clamp-none flex flex-wrap gap-x-3 gap-y-1">
          <span>
            {INVENTORY_VI.systemStockColon}{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatQty(line.systemQuantity)} {line.systemUnit}
            </span>
          </span>
          <span>
            {INVENTORY_VI.countedColon}{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatQty(line.countedQuantity)} {line.countedUnit}
            </span>
          </span>
        </ItemDescription>
        {line.note ? (
          <ItemDescription className="line-clamp-none break-words italic">
            {line.note}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="text-right">
        <span
          className={`font-mono font-semibold tabular-nums ${varianceClassName(
            line.variance,
          )}`}
        >
          {formatVariance(line.variance)} {line.varianceUnit}
        </span>
        <Badge variant="outline">{INVENTORY_VI.varianceShort}</Badge>
      </ItemActions>
    </Item>
  );
}
