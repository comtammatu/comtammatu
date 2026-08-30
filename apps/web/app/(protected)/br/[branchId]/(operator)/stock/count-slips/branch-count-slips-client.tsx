"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { confirm } from "@/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";

import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppBackLink, AppEmptyState, AppSheet } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import {
  BranchOperatorDetailList,
  BranchOperatorPage,
} from "@lib/branch-operator/components/branch-operator-page";
import {
  approveCountSlip,
  requestCountRecount,
} from "@/(protected)/inventory/count-slips/actions";
import {
  CountSlipWasteEvidence,
  isShortagePhotoRequired,
  type CountSlipWastePhotoUrls,
  type CountSlipWasteReasons,
} from "@/components/inventory/count-slip-waste-evidence";
import {
  CountSlipSurplusEvidence,
  type CountSlipSurplusReasons,
} from "@/components/inventory/count-slip-surplus-evidence";
import { formatQty } from "@lib/inventory/format";
import { formatQuantityInLargestUnits } from "@lib/inventory/quantity-unit-format";
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

function formatLineBaseQuantity(
  line: CountSlipLineView,
  quantity: number,
): string {
  return formatQuantityInLargestUnits(quantity, line.displayUnits, formatQty);
}

function formatLineCountedQuantity(line: CountSlipLineView): string {
  return line.countedBaseQuantity === null
    ? `${formatQty(line.countedQuantity)} ${line.countedUnit}`.trim()
    : formatLineBaseQuantity(line, line.countedBaseQuantity);
}

function formatLineVariance(line: CountSlipLineView): string {
  if (line.varianceBaseQuantity === null) return "—";
  const formatted = formatLineBaseQuantity(line, line.varianceBaseQuantity);
  return line.varianceBaseQuantity > 0 ? `+${formatted}` : formatted;
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
  tenantId,
  branchId,
  branchName,
  initialRows,
  loadFailed,
  focusFirstPending,
}: {
  tenantId: number;
  branchId: number;
  branchName: string;
  initialRows: CountSlipRow[];
  loadFailed: boolean;
  focusFirstPending: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [rows, setRows] = useState(initialRows);
  const [selectedId, setSelectedId] = useState<number | null>(() =>
    focusFirstPending
      ? (initialRows.find((row) => row.status === "submitted")?.id ?? null)
      : null,
  );
  const requestedView = searchParams.get("view");
  const view: QueueView = requestedView === "history" ? "history" : "pending";
  const setView = useCallback(
    (next: QueueView) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "pending") params.delete("view");
      else params.set("view", next);
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );
  const [recounting, setRecounting] = useState(false);
  const [recountNote, setRecountNote] = useState("");
  const [selectedRecountLineIds, setSelectedRecountLineIds] = useState<number[]>(
    [],
  );
  const [wastePhotoUrls, setWastePhotoUrls] =
    useState<CountSlipWastePhotoUrls>({});
  const [wasteReasons, setWasteReasons] = useState<CountSlipWasteReasons>({});
  const [surplusReasons, setSurplusReasons] =
    useState<CountSlipSurplusReasons>({});
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
  const selectedShortageLines =
    selected?.lines.filter(
      (line) => line.variance !== null && line.variance < 0,
    ) ?? [];
  const selectedSurplusLines =
    selected?.lines.filter(
      (line) => line.variance !== null && line.variance > 0,
    ) ?? [];
  const wasteEvidenceComplete = selectedShortageLines.every(
    (line) =>
      !isShortagePhotoRequired(wasteReasons[line.id]) ||
      (wastePhotoUrls[line.id]?.length ?? 0) > 0,
  );
  const needsWasteRecovery =
    selected?.status === "approved" &&
    selectedShortageLines.length > 0 &&
    selected.wasteIssueNumber === null;

  useEffect(() => setRows(initialRows), [initialRows]);
  useEffect(() => {
    setWastePhotoUrls({});
    setWasteReasons(
      Object.fromEntries(
        (selected?.lines.filter((line) => line.variance !== null && line.variance < 0) ?? []).map(
          (line) => [line.id, "discrepancy"],
        ),
      ),
    );
    setSurplusReasons(
      Object.fromEntries(
        (selected?.lines.filter((line) => line.variance !== null && line.variance > 0) ?? []).map(
          (line) => [line.id, "discrepancy"],
        ),
      ),
    );
    setSelectedRecountLineIds(
      selected?.lines
        .filter((line) => line.variance !== null && line.variance !== 0)
        .map((line) => line.id) ?? [],
    );
  }, [selected]);

  function closeReview() {
    setSelectedId(null);
    setRecounting(false);
    setRecountNote("");
    setSelectedRecountLineIds([]);
    setWastePhotoUrls({});
    setPendingAction(null);
  }

  function applyStatus(slipId: number, status: CountSlipStatus) {
    setRows((current) =>
      current.map((row) => (row.id === slipId ? { ...row, status } : row)),
    );
  }

  async function approveSelected() {
    if (!selected) return;
    const shortageLines = selectedShortageLines;
    const surplusLines = selectedSurplusLines;

    let autoCreateWaste = false;
    let autoAdjustSurplus = false;

    const hasShortage = shortageLines.length > 0;
    const hasSurplus = surplusLines.length > 0;

    if (hasShortage) {
      if (!wasteEvidenceComplete) {
        toast.error(INVENTORY_VI.countSlipWasteEvidenceRequired);
        return;
      }
    }

    const shortageSummary =
      shortageLines
        .slice(0, 3)
        .map(
          (l) =>
            `${l.ingredientName}: ${formatVariance(l.variance)} ${l.varianceUnit}`,
        )
        .join(", ") +
      (shortageLines.length > 3
        ? ` (+${shortageLines.length - 3} món khác)`
        : "");

    const surplusSummary =
      surplusLines
        .slice(0, 3)
        .map(
          (l) =>
            `${l.ingredientName}: +${formatVariance(l.variance)} ${l.varianceUnit}`,
        )
        .join(", ") +
      (surplusLines.length > 3
        ? ` (+${surplusLines.length - 3} món khác)`
        : "");

    if (needsWasteRecovery) {
      const ok = await confirm({
        title: INVENTORY_VI.countSlipRecoverWasteTitle,
        description: INVENTORY_VI.countSlipRecoverWasteHint,
        details: [
          { label: STAFF_VI.long, value: selected.employeeName },
          { label: INVENTORY_VI.warehouseShort, value: selected.locationName },
          {
            label: INVENTORY_VI.countSlipShortageDetectedTitle(
              shortageLines.length,
            ),
            value: shortageSummary,
          },
        ],
        confirmText: INVENTORY_VI.countSlipRecoverWasteAction,
        variant: "destructive",
      });
      if (!ok) return;
      autoCreateWaste = true;
    } else if (hasShortage && hasSurplus) {
      const ok = await confirm({
        title: INVENTORY_VI.countSlipApproveTitle,
        description: `${INVENTORY_VI.countSlipShortageDetectedHint} ${INVENTORY_VI.countSlipSurplusDetectedHint}`,
        details: [
          { label: STAFF_VI.long, value: selected.employeeName },
          { label: INVENTORY_VI.warehouseShort, value: selected.locationName },
          {
            label: INVENTORY_VI.countSlipShortageDetectedTitle(
              shortageLines.length,
            ),
            value: shortageSummary,
          },
          {
            label: INVENTORY_VI.countSlipSurplusDetectedTitle(
              surplusLines.length,
            ),
            value: surplusSummary,
          },
        ],
        confirmText: INVENTORY_VI.countSlipApproveWasteAndSurplusAction,
      });
      if (!ok) return;
      autoCreateWaste = true;
      autoAdjustSurplus = true;
    } else if (hasShortage) {
      const ok = await confirm({
        title: INVENTORY_VI.countSlipApproveTitle,
        description: INVENTORY_VI.countSlipShortageDetectedHint,
        details: [
          { label: STAFF_VI.long, value: selected.employeeName },
          { label: INVENTORY_VI.warehouseShort, value: selected.locationName },
          {
            label: INVENTORY_VI.countSlipShortageDetectedTitle(
              shortageLines.length,
            ),
            value: shortageSummary,
          },
        ],
        confirmText: INVENTORY_VI.countSlipApproveAndWasteAction,
        variant: "destructive",
      });
      if (!ok) return;
      autoCreateWaste = true;
    } else if (hasSurplus) {
      const ok = await confirm({
        title: INVENTORY_VI.countSlipApproveTitle,
        description: INVENTORY_VI.countSlipSurplusDetectedHint,
        details: [
          { label: STAFF_VI.long, value: selected.employeeName },
          { label: INVENTORY_VI.warehouseShort, value: selected.locationName },
          {
            label: INVENTORY_VI.countSlipSurplusDetectedTitle(
              surplusLines.length,
            ),
            value: surplusSummary,
          },
        ],
        confirmText: INVENTORY_VI.countSlipApproveAndAdjustAction,
      });
      if (!ok) return;
      autoAdjustSurplus = true;
    } else {
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
      });
      if (!ok) return;
    }

    setPendingAction("approve");
    startTransition(async () => {
      const result = await approveCountSlip({
        slipId: selected.id,
        autoCreateWaste,
        autoAdjustSurplus,
        wastePhotoUrls,
        wasteReasons,
        surplusReasons,
        allowSelfReview: true,
      });
      setPendingAction(null);
      if (!result.success || !result.data) {
        toast.error(result.error ?? INVENTORY_VI.countSlipApproveFailed);
        return;
      }
      if (
        result.data.wasteCreated &&
        result.data.wasteIssueNumber &&
        result.data.surplusAdjusted
      ) {
        toast.success(
          INVENTORY_VI.countSlipApprovedWithWasteAndSurplus(
            result.data.wasteIssueNumber,
            result.data.wasteItemsCount ?? 0,
            result.data.surplusLinesCount ?? 0,
          ),
        );
      } else if (result.data.wasteCreated && result.data.wasteIssueNumber) {
        toast.success(
          result.data.requiresApproval
            ? INVENTORY_VI.countSlipApprovedWithWastePending(
                result.data.wasteIssueNumber,
              )
            : INVENTORY_VI.countSlipApprovedWithWaste(
                result.data.wasteIssueNumber,
                result.data.wasteItemsCount ?? 0,
              ),
        );
      } else if (result.data.surplusAdjusted) {
        toast.success(
          INVENTORY_VI.countSlipApprovedWithSurplus(
            result.data.surplusLinesCount ?? 0,
          ),
        );
      } else {
        toast.success(INVENTORY_VI.countSlipApproved);
      }
      applyStatus(selected.id, "approved");
      closeReview();
      router.refresh();
    });
  }

  async function requestRecount() {
    if (!selected) return;
    if (selectedRecountLineIds.length === 0) {
      toast.error("Chọn ít nhất một nguyên liệu cần đếm lại.");
      return;
    }
    if (recountNote.trim().length < 3) {
      toast.error(INVENTORY_VI.recountReasonRequired);
      return;
    }
    const accepted = await confirm({
      title: INVENTORY_VI.recountConfirmTitle,
      description: INVENTORY_VI.recountConfirmDescription(
        selectedRecountLineIds.length,
      ),
      details: [
        { label: STAFF_VI.long, value: selected.employeeName },
        {
          label: INVENTORY_VI.lineCountLabel,
          value: String(selectedRecountLineIds.length),
        },
        { label: "Lý do", value: recountNote.trim() },
      ],
      confirmText: INVENTORY_VI.sendRecountRequest,
    });
    if (!accepted) return;
    setPendingAction("recount");
    startTransition(async () => {
      const result = await requestCountRecount({
        slipId: selected.id,
        lineIds: selectedRecountLineIds,
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
      back={<AppBackLink href={`/br/${branchId}/stock`} />}
    >
      <Tabs
        value={view}
        onValueChange={(next) => {
          if (!next) return;
          setView(next as QueueView);
        }}
        className="w-full"
      >
        <TabsList
          size="touch"
          aria-label={INVENTORY_VI.countSlipTitle}
          className="grid w-full grid-cols-2"
        >
          <TabsTrigger value="pending">
            {INVENTORY_VI.countSlipPendingBadge(pendingRows.length)}
          </TabsTrigger>
          <TabsTrigger value="history">
            {INVENTORY_VI.countSlipHistoryTitle}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {searchParams.get("employeeId") ? (
        <NoteCallout tone="muted" className="items-center justify-between">
          <span className="text-xs">{ACTIONS_VI.filter}: {STAFF_VI.long}</span>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              params.delete("employeeId");
              const q = params.toString();
              router.replace(q ? `${pathname}?${q}` : pathname);
            }}
          >
            {ACTIONS_VI.clearFilter}
          </Button>
        </NoteCallout>
      ) : null}
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
          <ItemGroup className="grid gap-2 lg:grid-cols-2">
            {visibleRows.map((row) => (
              <Item
                key={row.id}
                variant="outline"
                className="min-h-20 min-w-0 flex-nowrap touch-manipulation"
                render={
                  <button type="button" onClick={() => setSelectedId(row.id)} />
                }
              >
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
                <ItemActions className="shrink-0">
                  <StatusBadge
                    domain="count-slip"
                    value={row.status}
                    size="sm"
                  />
                  <IconChevronRight className="size-4 text-muted-foreground" />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </section>

      <AppSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        title={selected?.employeeName ?? ""}
        description={
          selected ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>{selected.locationName}</span>
              {selected.shiftName ? <span>{selected.shiftName}</span> : null}
              <StatusBadge
                domain="count-slip"
                value={selected.status}
                size="sm"
              />
            </span>
          ) : undefined
        }
        side="bottom"
        contentClassName="flex max-h-dvh-95 flex-col overflow-hidden text-foreground"
        headerClassName="shrink-0"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain"
        footerClassName="shrink-0 border-t"
        footer={
          selected ? (
            selected.status === "submitted" ? (
              recounting ? (
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="flex-1"
                    disabled={isPending}
                    onClick={() => {
                      setRecounting(false);
                      setRecountNote("");
                      setSelectedRecountLineIds([]);
                    }}
                  >
                    {ACTIONS_VI.cancel}
                  </Button>
                  <Button
                    type="button"
                    size="touch"
                    className="flex-1"
                    disabled={
                      isPending ||
                      recountNote.trim().length < 3 ||
                      selectedRecountLineIds.length === 0
                    }
                    onClick={() => void requestRecount()}
                  >
                    {pendingAction === "recount" ? (
                      <Spinner className="size-5" />
                    ) : (
                      <IconRecount className="size-4" />
                    )}
                    {INVENTORY_VI.sendRecountRequest}
                  </Button>
                </div>
              ) : (
                <div className="flex w-full gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="flex-1"
                    disabled={isPending}
                    onClick={() => {
                      setSelectedRecountLineIds(
                        selected.lines
                          .filter(
                            (line) =>
                              line.variance !== null && line.variance !== 0,
                          )
                          .map((line) => line.id),
                      );
                      setRecounting(true);
                    }}
                  >
                    <IconRecount className="size-4" />
                    {INVENTORY_VI.requestRecount}
                  </Button>
                  <Button
                    type="button"
                    size="touch"
                    className="flex-1"
                    disabled={
                      isPending ||
                      (selectedShortageLines.length > 0 &&
                        !wasteEvidenceComplete)
                    }
                    onClick={() => void approveSelected()}
                  >
                    {pendingAction === "approve" ? (
                      <Spinner className="size-5" />
                    ) : (
                      <IconCheck className="size-4" />
                    )}
                    {INVENTORY_VI.countSlipHandoverConfirm}
                  </Button>
                </div>
              )
            ) : needsWasteRecovery ? (
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="flex-1"
                  disabled={isPending}
                  onClick={closeReview}
                >
                  {ACTIONS_VI.close}
                </Button>
                <Button
                  type="button"
                  size="touch"
                  className="flex-1"
                  disabled={isPending || !wasteEvidenceComplete}
                  onClick={() => void approveSelected()}
                >
                  {pendingAction === "approve" ? (
                    <Spinner className="size-5" />
                  ) : (
                    <IconCheck className="size-4" />
                  )}
                  {INVENTORY_VI.countSlipRecoverWasteAction}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full"
                onClick={closeReview}
              >
                {ACTIONS_VI.close}
              </Button>
            )
          ) : null
        }
      >
        {selected ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
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
                <CountSlipLineItem
                  key={line.id}
                  line={line}
                  selecting={recounting}
                  selected={selectedRecountLineIds.includes(line.id)}
                  onSelectedChange={(checked) =>
                    setSelectedRecountLineIds((current) =>
                      checked
                        ? [...new Set([...current, line.id])]
                        : current.filter((id) => id !== line.id),
                    )
                  }
                />
              ))}
            </ItemGroup>

            {!recounting &&
            (selected.status === "submitted" || needsWasteRecovery) ? (
              <CountSlipWasteEvidence
                tenantId={tenantId}
                branchId={branchId}
                slipId={selected.id}
                lines={selectedShortageLines}
                values={wastePhotoUrls}
                reasons={wasteReasons}
                disabled={isPending}
                touch
                onChange={(lineId, url) =>
                  setWastePhotoUrls((current) => ({
                    ...current,
                    [lineId]: url ? [url] : [],
                  }))
                }
                onReasonChange={(lineId, reason) =>
                  setWasteReasons((current) => ({
                    ...current,
                    [lineId]: reason,
                  }))
                }
              />
            ) : null}

            {!recounting &&
            selected.status === "submitted" &&
            selectedSurplusLines.length > 0 ? (
              <CountSlipSurplusEvidence
                lines={selectedSurplusLines}
                reasons={surplusReasons}
                disabled={isPending}
                touch
                onReasonChange={(lineId, reason) =>
                  setSurplusReasons((current) => ({
                    ...current,
                    [lineId]: reason,
                  }))
                }
              />
            ) : null}

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
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    disabled={isPending}
                    onClick={() =>
                      setSelectedRecountLineIds(
                        selected.lines
                          .filter(
                            (line) =>
                              line.variance !== null && line.variance !== 0,
                          )
                          .map((line) => line.id),
                      )
                    }
                  >
                    {INVENTORY_VI.recountSelectVariance}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="touch"
                    disabled={isPending}
                    onClick={() => setSelectedRecountLineIds([])}
                  >
                    {INVENTORY_VI.recountClearSelection}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {INVENTORY_VI.recountSelectionCount(
                      selectedRecountLineIds.length,
                    )}
                  </span>
                </div>
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
        ) : null}
      </AppSheet>
    </BranchOperatorPage>
  );
}

function CountSlipLineItem({
  line,
  selecting,
  selected,
  onSelectedChange,
}: {
  line: CountSlipLineView;
  selecting: boolean;
  selected: boolean;
  onSelectedChange: (checked: boolean) => void;
}) {
  const isShortage = line.variance !== null && line.variance < 0;
  const isSurplus = line.variance !== null && line.variance > 0;
  const isMatched = line.variance === 0;
  const isMatchedAfterSales =
    !isMatched &&
    line.currentLiveQuantity !== null &&
    line.countedQuantity === line.currentLiveQuantity;
  const soldSinceSubmit =
    line.currentLiveBaseQuantity !== null &&
    line.systemBaseQuantity > line.currentLiveBaseQuantity
      ? line.systemBaseQuantity - line.currentLiveBaseQuantity
      : null;

  return (
    <Item variant="muted" className="min-h-20 items-start">
      <ItemContent className="min-w-0 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {selecting ? (
              <Checkbox
                checked={selected}
                onCheckedChange={onSelectedChange}
                aria-label={`Chọn ${line.ingredientName} để đếm lại`}
              />
            ) : null}
            <ItemTitle>{line.ingredientName}</ItemTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`font-mono font-semibold tabular-nums ${varianceClassName(
                line.variance,
              )}`}
            >
              {formatLineVariance(line)}
            </span>
            {isMatchedAfterSales ? (
              <Badge variant="success">
                {INVENTORY_VI.matchedAfterSales}
              </Badge>
            ) : isShortage ? (
              <Badge variant="destructive">
                {INVENTORY_VI.varianceShortageBadge}
              </Badge>
            ) : isSurplus ? (
              <Badge variant="warning">
                {INVENTORY_VI.varianceSurplusBadge}
              </Badge>
            ) : isMatched ? (
              <Badge variant="outline">
                {INVENTORY_VI.varianceMatchedBadge}
              </Badge>
            ) : null}
          </div>
        </div>

        <ItemDescription className="line-clamp-none flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span>
            {INVENTORY_VI.systemStockColon}{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatLineBaseQuantity(line, line.systemBaseQuantity)}
            </span>
          </span>
          <span>
            {INVENTORY_VI.countedColon}{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatLineCountedQuantity(line)}
            </span>
          </span>
        </ItemDescription>

        {soldSinceSubmit !== null || line.currentLiveBaseQuantity !== null ? (
          <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground/70">
              ↳ {INVENTORY_VI.referenceColon}
            </span>
            {soldSinceSubmit !== null ? (
              <span>
                {INVENTORY_VI.soldSinceSubmitColon}{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatLineBaseQuantity(line, soldSinceSubmit)}
                </span>
              </span>
            ) : null}
            {soldSinceSubmit !== null && line.currentLiveBaseQuantity !== null ? (
              <span>·</span>
            ) : null}
            {line.currentLiveBaseQuantity !== null ? (
              <span>
                {INVENTORY_VI.liveStockColon}{" "}
                <span className="font-mono tabular-nums text-foreground">
                  {formatLineBaseQuantity(line, line.currentLiveBaseQuantity)}
                </span>
              </span>
            ) : null}
          </ItemDescription>
        ) : null}

        {line.note ? (
          <ItemDescription className="line-clamp-none break-words text-xs italic text-muted-foreground">
            📝 {line.note}
          </ItemDescription>
        ) : null}
        {line.lastRecountRound > 0 ? (
          <ItemDescription className="line-clamp-none text-xs font-medium text-info">
            {INVENTORY_VI.recountCompletedRound(line.lastRecountRound)}
          </ItemDescription>
        ) : null}
      </ItemContent>
    </Item>
  );
}
