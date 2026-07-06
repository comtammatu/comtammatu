"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check as IconCheck,
  ClipboardCheck as IconClipboardCheck,
  RotateCcw as IconRecount,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import { cn } from "@comtammatu/ui";
import {
  ACTIONS_VI,
  INVENTORY_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import { formatVNDate, formatVNDateTime } from "@comtammatu/shared/time";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { formatQty } from "../_lib/format";
import { approveCountSlip, requestCountRecount } from "./actions";
import type { CountSlipLineView } from "./line-view-model";

export type CountSlipStatus = "submitted" | "needs_changes" | "approved";

export type CountSlipLine = CountSlipLineView;

export type CountSlipRow = {
  id: number;
  branchName: string;
  locationName: string;
  employeeName: string;
  countDate: string;
  status: CountSlipStatus;
  note: string | null;
  reviewNote: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  lines: CountSlipLine[];
};

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

function hasVariance(
  line: CountSlipLine,
): line is CountSlipLine & { variance: number } {
  return line.variance !== null;
}

export function CountSlipsClient({
  initial,
  branchScoped = false,
  embedded = false,
}: {
  initial: CountSlipRow[];
  branchScoped?: boolean;
  embedded?: boolean;
}) {
  const [rows, setRows] = useState(initial);

  const { pending, history } = useMemo(() => {
    const pendingRows: CountSlipRow[] = [];
    const historyRows: CountSlipRow[] = [];
    for (const row of rows) {
      if (row.status === "submitted") pendingRows.push(row);
      else historyRows.push(row);
    }
    return { pending: pendingRows, history: historyRows };
  }, [rows]);

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((prev) =>
      prev.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
  }

  const content = (
    <>
      {!embedded ? (
        <AppPageHeader
          title={INVENTORY_VI.countSlipTitle}
          description={INVENTORY_VI.countSlipDescription}
          badge={{
            children: INVENTORY_VI.countSlipPendingBadge(pending.length),
            variant: pending.length > 0 ? "warning" : "secondary",
          }}
        />
      ) : null}

      {pending.length === 0 ? (
        <AppEmptyState
          compact
          title={INVENTORY_VI.countSlipEmptyTitle}
          description={INVENTORY_VI.countSlipEmptyDescription}
          icon={<IconClipboardCheck />}
        />
      ) : (
        <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
          {pending.map((row) => (
            <CountSlipCard
              key={row.id}
              row={row}
              branchScoped={branchScoped}
              embedded={embedded}
              onApproved={() => applyStatus(row.id, "approved")}
              onRecount={() => applyStatus(row.id, "needs_changes")}
            />
          ))}
        </ItemGroup>
      )}

      {history.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-base font-semibold tracking-tight">
            {INVENTORY_VI.countSlipHistoryTitle}
          </h2>
          <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
            {history.map((row) => (
              <CountSlipCard
                key={row.id}
                row={row}
                branchScoped={branchScoped}
                embedded={embedded}
                readOnly
              />
            ))}
          </ItemGroup>
        </section>
      ) : null}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <AppPage width="wide" density="compact">
      {content}
    </AppPage>
  );
}

function CountSlipCard({
  row,
  branchScoped = false,
  readOnly = false,
  embedded = false,
  onApproved,
  onRecount,
}: {
  row: CountSlipRow;
  branchScoped?: boolean;
  readOnly?: boolean;
  embedded?: boolean;
  onApproved?: () => void;
  onRecount?: () => void;
}) {
  const router = useRouter();
  const [recounting, setRecounting] = useState(false);
  const [note, setNote] = useState("");
  const [pendingAction, setPendingAction] = useState<
    "approve" | "recount" | null
  >(null);
  const [, startTransition] = useTransition();

  const knownVarianceLines = row.lines.filter(hasVariance);
  const totalVariance = knownVarianceLines.reduce(
    (sum, line) => sum + (line.variance ?? 0),
    0,
  );
  const varianceUnits = new Set(
    knownVarianceLines.map((line) => line.varianceUnit).filter(Boolean),
  );
  const totalVarianceUnit =
    varianceUnits.size === 1 ? (varianceUnits.values().next().value ?? "") : "";
  const showTotalVariance =
    knownVarianceLines.length === row.lines.length && totalVarianceUnit !== "";
  const changedLineCount = knownVarianceLines.filter(
    (line) => line.variance !== 0,
  ).length;
  const hasShrinkage = row.lines.some(
    (line) => line.variance !== null && line.variance < 0,
  );

  async function handleApprove() {
    const ok = await confirm({
      title: INVENTORY_VI.countSlipApproveTitle,
      description: INVENTORY_VI.countSlipApproveDescription,
      details: [
        { label: STAFF_VI.long, value: row.employeeName },
        { label: INVENTORY_VI.warehouseShort, value: row.locationName },
        {
          label: INVENTORY_VI.lineCountLabel,
          value: INVENTORY_VI.ingredientCountBadge(row.lines.length),
        },
      ],
      confirmText: ACTIONS_VI.approve,
      variant: "destructive",
    });
    if (!ok) return;

    setPendingAction("approve");
    startTransition(async () => {
      const res = await approveCountSlip({ slipId: row.id });
      setPendingAction(null);
      if (!res.success) {
        toast.error(res.error ?? INVENTORY_VI.countSlipApproveFailed);
        return;
      }
      toast.success(
        res.data && res.data.adjustedLines > 0
          ? INVENTORY_VI.countSlipApprovedAdjusted(res.data.adjustedLines)
          : INVENTORY_VI.countSlipApproved,
      );
      onApproved?.();
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
      const res = await requestCountRecount({ slipId: row.id, note });
      setPendingAction(null);
      if (!res.success) {
        toast.error(res.error ?? INVENTORY_VI.recountRequestFailed);
        return;
      }
      toast.success(INVENTORY_VI.recountRequested);
      setRecounting(false);
      setNote("");
      onRecount?.();
      router.refresh();
    });
  }

  return (
    <div role="listitem">
      <div
        className={cn(
          "rounded-lg border bg-card",
          !readOnly && hasShrinkage && "border-destructive/20",
        )}
      >
        <div className="flex items-start justify-between gap-2 p-4 pb-3">
          <div className="min-w-0">
            <div className="font-heading flex flex-wrap items-center gap-2 text-base font-semibold">
              {row.employeeName}
              {branchScoped ? null : (
                <Badge variant="outline" className="text-xs">
                  {row.branchName}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {row.locationName}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {INVENTORY_VI.countDateAt(formatVNDate(row.countDate))}
              {row.submittedAt
                ? INVENTORY_VI.submittedAtSuffix(
                    formatVNDateTime(row.submittedAt),
                  )
                : ""}
            </p>
          </div>
          <StatusBadge domain="count-slip" value={row.status} />
        </div>

        <div className="flex flex-col gap-3 p-4 pt-0">
          <ItemGroup className="flex flex-col gap-2 p-0 rounded-none border-0">
            {row.lines.map((line) => (
              <Item
                key={line.id}
                variant="muted"
                className="rounded-md border bg-muted/20 p-3 text-sm flex flex-col items-stretch"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{line.ingredientName}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
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
                      {line.countedBaseQuantity !== null &&
                      line.countedUnit !== line.systemUnit ? (
                        <span>
                          {INVENTORY_VI.convertedColon}{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            {formatQty(line.countedBaseQuantity)}{" "}
                            {line.systemUnit}
                          </span>
                        </span>
                      ) : null}
                    </div>
                    {line.note ? (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        {line.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div
                      className={cn(
                        "font-mono text-sm font-semibold tabular-nums",
                        varianceClassName(line.variance),
                      )}
                    >
                      {formatVariance(line.variance)}
                      {line.variance !== null ? ` ${line.varianceUnit}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {INVENTORY_VI.varianceShort}
                    </div>
                  </div>
                </div>
              </Item>
            ))}
          </ItemGroup>

          {row.note ? (
            <p className="text-xs italic text-muted-foreground">
              {INVENTORY_VI.employeeNoteLine(row.note)}
            </p>
          ) : null}

          {row.reviewNote ? (
            <p className="text-xs italic text-warning">
              {INVENTORY_VI.recountReasonLine(row.reviewNote)}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">
              {INVENTORY_VI.grnDraftLineCount(row.lines.length)}
            </span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                varianceClassName(totalVariance),
              )}
            >
              {showTotalVariance
                ? INVENTORY_VI.totalVarianceSummary(
                    formatVariance(totalVariance),
                    totalVarianceUnit,
                  )
                : INVENTORY_VI.varianceLineCount(changedLineCount)}
            </span>
          </div>

          {!readOnly ? (
            <>
              {recounting ? (
                <div className="flex flex-col gap-2">
                  <Label>{INVENTORY_VI.recountReasonLabel}</Label>
                  <Textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={pendingAction !== null}
                    rows={2}
                    placeholder={INVENTORY_VI.recountReasonPlaceholder}
                  />
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                {recounting ? (
                  <>
                    <Button
                      variant="outline"
                      size={embedded ? "touch" : "default"}
                      onClick={() => {
                        setRecounting(false);
                        setNote("");
                      }}
                      disabled={pendingAction !== null}
                    >
                      {ACTIONS_VI.cancel}
                    </Button>
                    <Button
                      size={embedded ? "touch" : "default"}
                      onClick={handleRecount}
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "recount" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconRecount data-icon="inline-start" />
                      )}
                      {INVENTORY_VI.sendRecountRequest}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size={embedded ? "touch" : "default"}
                      onClick={() => setRecounting(true)}
                      disabled={pendingAction !== null}
                    >
                      <IconRecount data-icon="inline-start" />
                      {INVENTORY_VI.requestRecount}
                    </Button>
                    <Button
                      size={embedded ? "touch" : "default"}
                      onClick={handleApprove}
                      disabled={pendingAction !== null}
                    >
                      {pendingAction === "approve" ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconCheck data-icon="inline-start" />
                      )}
                      {ACTIONS_VI.approve}
                    </Button>
                  </>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
