"use client";

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
  ChevronUp as IconChevronUp,
  ClipboardCheck as IconClipboardCheck,
  RotateCcw as IconRecount,
  Search as IconSearch,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import { cn } from "@comtammatu/ui";
import { AppBackLink, AppEmptyState, AppSheet } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
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
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);

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
  const [showMatchedLines, setShowMatchedLines] = useState(false);
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

  const discrepancyCount = useMemo(
    () => rows.filter((row) => changedLineCount(row) > 0).length,
    [rows],
  );
  const approvedCount = useMemo(
    () => historyRows.filter((row) => row.status === "approved").length,
    [historyRows],
  );

  const baseVisibleRows = view === "pending" ? pendingRows : historyRows;

  const visibleRows = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return baseVisibleRows;
    return baseVisibleRows.filter((row) =>
      row.slipNumber.toLowerCase().includes(query) ||
      row.employeeName.toLowerCase().includes(query) ||
      row.locationName.toLowerCase().includes(query) ||
      (row.shiftName && row.shiftName.toLowerCase().includes(query))
    );
  }, [baseVisibleRows, deferredSearchQuery]);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const selectedShortageLines = useMemo(
    () =>
      selected?.lines.filter(
        (line) => line.variance !== null && line.variance < 0,
      ) ?? [],
    [selected],
  );
  const selectedSurplusLines = useMemo(
    () =>
      selected?.lines.filter(
        (line) => line.variance !== null && line.variance > 0,
      ) ?? [],
    [selected],
  );
  const selectedMatchedLines = useMemo(
    () =>
      selected?.lines.filter(
        (line) => line.variance === 0,
      ) ?? [],
    [selected],
  );
  const selectedDiscrepancyLines = useMemo(
    () => [...selectedShortageLines, ...selectedSurplusLines],
    [selectedShortageLines, selectedSurplusLines],
  );

  const incompleteResolutionCount = selectedShortageLines.filter(
    (line) =>
      isShortagePhotoRequired(wasteReasons[line.id]) &&
      (wastePhotoUrls[line.id]?.length ?? 0) === 0,
  ).length;
  const wasteEvidenceComplete = incompleteResolutionCount === 0;
  const needsWasteRecovery =
    selected?.status === "approved" &&
    selectedShortageLines.length > 0 &&
    selected.wasteIssueNumber === null;

  useEffect(() => setRows(initialRows), [initialRows]);
  useEffect(() => {
    setShowMatchedLines(false);
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
    setShowMatchedLines(false);
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
          layout="equal"
          aria-label={INVENTORY_VI.countSlipTitle}
        >
          <TabsTrigger value="pending">
            {INVENTORY_VI.countSlipPendingBadge(pendingRows.length)}
          </TabsTrigger>
          <TabsTrigger value="history">
            {INVENTORY_VI.countSlipHistoryTitle} ({historyRows.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Item
          variant="outline"
          className={cn(
            "flex items-center gap-2 p-2 text-left cursor-pointer transition-colors",
            view === "pending"
              ? "border-warning ring-1 ring-warning bg-warning/10"
              : "border-border bg-card hover:bg-muted/30",
          )}
          render={<button type="button" onClick={() => setView("pending")} />}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-warning font-mono text-xs font-semibold text-warning-foreground">
            {pendingRows.length}
          </span>
          <span className="text-xs font-medium text-foreground truncate">
            {INVENTORY_VI.countSlipPendingCard}
          </span>
        </Item>

        <Item
          variant="outline"
          className="flex items-center gap-2 p-2 text-left border-border bg-card"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-destructive font-mono text-xs font-semibold text-destructive-foreground">
            {discrepancyCount}
          </span>
          <span className="text-xs font-medium text-foreground truncate">
            {INVENTORY_VI.countSlipDiscrepancyCard}
          </span>
        </Item>

        <Item
          variant="outline"
          className={cn(
            "flex items-center gap-2 p-2 text-left cursor-pointer transition-colors",
            view === "history"
              ? "border-success ring-1 ring-success bg-success/10"
              : "border-border bg-card hover:bg-muted/30",
          )}
          render={<button type="button" onClick={() => setView("history")} />}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success font-mono text-xs font-semibold text-success-foreground">
            {approvedCount}
          </span>
          <span className="text-xs font-medium text-foreground truncate">
            {INVENTORY_VI.countSlipApprovedCard}
          </span>
        </Item>

        <Item
          variant="outline"
          className="flex items-center gap-2 p-2 text-left border-border bg-card"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-foreground">
            {rows.length}
          </span>
          <span className="text-xs font-medium text-foreground truncate">
            {INVENTORY_VI.countSlipTotalCard}
          </span>
        </Item>
      </div>

      <InputGroup size="field" className="w-full bg-card">
        <InputGroupAddon align="inline-start">
          <IconSearch className="size-4 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={INVENTORY_VI.countSlipSearchPlaceholder}
        />
      </InputGroup>

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
            title={
              searchQuery.trim()
                ? INVENTORY_VI.countSlipNotFoundTitle
                : INVENTORY_VI.countSlipEmptyTitle
            }
            description={
              searchQuery.trim()
                ? INVENTORY_VI.countSlipNotFoundDesc
                : INVENTORY_VI.countSlipEmptyDescription
            }
          />
        ) : (
          <ItemGroup className="grid gap-2 lg:grid-cols-2">
            {visibleRows.map((row) => {
              const diffCount = changedLineCount(row);
              return (
                <Item
                  key={row.id}
                  variant="outline"
                  className="min-h-16 min-w-0 flex-nowrap p-3 touch-manipulation cursor-pointer bg-card hover:bg-muted/30 transition-colors"
                  render={
                    <button type="button" onClick={() => setSelectedId(row.id)} />
                  }
                >
                  <ItemContent className="min-w-0 gap-1.5 text-left">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <ItemTitle size="heading" className="truncate font-semibold text-sm">
                        {row.employeeName}
                      </ItemTitle>
                      <StatusBadge
                        domain="count-slip"
                        value={row.status}
                        size="sm"
                      />
                    </div>
                    <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-mono">{row.slipNumber}</span>
                      <span>· {row.locationName}</span>
                      {row.shiftName ? <span>· {row.shiftName}</span> : null}
                      <span>· {formatVNDate(row.countDate)}</span>
                    </ItemDescription>
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <Badge variant="outline" className="text-2xs font-normal">
                        {INVENTORY_VI.grnDraftLineCount(row.lines.length)}
                      </Badge>
                      {diffCount > 0 ? (
                        <Badge variant="warning" className="text-2xs font-normal">
                          {INVENTORY_VI.varianceLineCount(diffCount)}
                        </Badge>
                      ) : (
                        <Badge variant="success" className="text-2xs font-normal">
                          {INVENTORY_VI.varianceMatchedBadge}
                        </Badge>
                      )}
                    </div>
                  </ItemContent>
                  <ItemActions className="shrink-0 self-center">
                    <IconChevronRight className="size-4 text-muted-foreground" />
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        )}
      </section>

      <AppSheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) closeReview();
        }}
        title={
          selected ? (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-semibold">{selected.employeeName}</span>
              <StatusBadge
                domain="count-slip"
                value={selected.status}
                size="sm"
              />
            </div>
          ) : ""
        }
        description={
          selected ? (
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{selected.locationName}</span>
              {selected.shiftName ? <span>· {selected.shiftName}</span> : null}
              <span>
                {INVENTORY_VI.submittedAtSuffix(
                  selected.submittedAt
                    ? formatVNDateTime(selected.submittedAt)
                    : formatVNDate(selected.countDate),
                )}
              </span>
              <span className="font-mono tabular-nums">· {selected.slipNumber}</span>
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
                    className="flex-1 font-semibold"
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
                      setShowMatchedLines(true);
                      setRecounting(true);
                    }}
                  >
                    <IconRecount className="size-4" />
                    {INVENTORY_VI.requestRecount}
                  </Button>
                  <Button
                    type="button"
                    size="touch"
                    className="flex-1 font-semibold"
                    disabled={
                      isPending ||
                      incompleteResolutionCount > 0
                    }
                    onClick={() => void approveSelected()}
                  >
                    {pendingAction === "approve" ? (
                      <Spinner className="size-5" />
                    ) : (
                      <IconCheck className="size-4" />
                    )}
                    {incompleteResolutionCount > 0
                      ? INVENTORY_VI.countSlipResolutionRemaining(
                          incompleteResolutionCount,
                        )
                      : INVENTORY_VI.countSlipContinueReview}
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
                  className="flex-1 font-semibold"
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
            <p className="text-xs text-muted-foreground">
              {INVENTORY_VI.countSlipCompactSummary(
                selected.lines.length,
                selectedMatchedLines.length,
                selectedShortageLines.length,
                selectedSurplusLines.length,
              )}
            </p>

            {selected.note ? (
              <NoteCallout tone="muted">
                {INVENTORY_VI.employeeNoteLine(selected.note)}
              </NoteCallout>
            ) : null}
            {selected.reviewNote ? (
              <NoteCallout tone="warning">
                {INVENTORY_VI.recountReasonLine(selected.reviewNote)}
              </NoteCallout>
            ) : null}

            {selectedDiscrepancyLines.length > 0 ? (
              <div className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <span>{INVENTORY_VI.countSlipNeedsResolution}</span>
                <span>{selectedDiscrepancyLines.length}</span>
              </div>
            ) : null}

            {selectedDiscrepancyLines.length > 0 ? (
              <ItemGroup className="gap-2">
                {selectedDiscrepancyLines.map((line) => (
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
            ) : null}

            {selectedMatchedLines.length > 0 &&
            selectedDiscrepancyLines.length > 0 &&
            !recounting ? (
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="w-full justify-between px-1 text-success"
                aria-expanded={showMatchedLines}
                onClick={() => setShowMatchedLines((current) => !current)}
              >
                {INVENTORY_VI.countSlipMatchedDisclosure(selectedMatchedLines.length)}
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  {showMatchedLines ? ACTIONS_VI.showLess : ACTIONS_VI.viewDetails}
                  {showMatchedLines ? (
                    <IconChevronUp className="size-4" />
                  ) : (
                    <IconChevronDown className="size-4" />
                  )}
                </span>
              </Button>
            ) : null}

            {selectedMatchedLines.length > 0 &&
            (selectedDiscrepancyLines.length === 0 || recounting || showMatchedLines) ? (
              <ItemGroup className="gap-2">
                {selectedMatchedLines.map((line) => (
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
            ) : null}

            {!recounting &&
            (selected.status === "submitted" || needsWasteRecovery) &&
            selectedShortageLines.length > 0 ? (
              <CountSlipWasteEvidence
                  key={`waste-${selected.id}`}
                  tenantId={tenantId}
                  branchId={branchId}
                  slipId={selected.id}
                  lines={selectedShortageLines}
                  values={wastePhotoUrls}
                  reasons={wasteReasons}
                  disabled={isPending}
                  touch
                  defaultExpanded
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
                  key={`surplus-${selected.id}`}
                  lines={selectedSurplusLines}
                  reasons={surplusReasons}
                  disabled={isPending}
                  touch
                  defaultExpanded
                  onReasonChange={(lineId, reason) =>
                    setSurplusReasons((current) => ({
                      ...current,
                      [lineId]: reason,
                    }))
                  }
                />
            ) : null}

            {recounting ? (
              <Item variant="outline" className="flex-col items-stretch gap-2 border-warning/20 p-3">
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
              </Item>
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
  const hasLiveDelta =
    line.currentLiveBaseQuantity !== null &&
    Math.abs(line.currentLiveBaseQuantity - line.systemBaseQuantity) > 0.0001;

  return (
    <Item variant="outline" className="min-h-16 items-start p-2.5 bg-card">
      <ItemContent className="min-w-0 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5 flex-wrap">
            {selecting ? (
              <Checkbox
                checked={selected}
                onCheckedChange={onSelectedChange}
                aria-label={`Chọn ${line.ingredientName} để đếm lại`}
              />
            ) : null}
            <ItemTitle className="font-semibold text-sm text-foreground truncate">
              {line.ingredientName}
            </ItemTitle>
            {line.lastRecountRound > 0 ? (
              <Badge
                variant="outline"
                className="border-info/20 text-info text-2xs py-0 px-1 font-normal"
              >
                {INVENTORY_VI.recountRoundBadge(line.lastRecountRound)}
              </Badge>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isShortage ? (
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

        <div className="grid grid-cols-3 gap-1.5 p-1.5 text-center text-xs bg-muted/30">
          <div className="flex flex-col min-w-0">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {INVENTORY_VI.systemStockLabel}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground mt-0.5 truncate">
              {formatLineBaseQuantity(line, line.systemBaseQuantity)}
            </span>
            {hasLiveDelta ? (
              <span className="text-2xs text-muted-foreground truncate">
                {INVENTORY_VI.currentStockShort} {formatLineBaseQuantity(line, line.currentLiveBaseQuantity!)}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {INVENTORY_VI.countedLabel}
            </span>
            <span className="font-mono font-semibold tabular-nums text-foreground mt-0.5 truncate">
              {formatLineCountedQuantity(line)}
            </span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-2xs uppercase tracking-wider text-muted-foreground">
              {INVENTORY_VI.varianceShort}
            </span>
            <span
              className={cn(
                "font-mono font-semibold tabular-nums mt-0.5 truncate",
                varianceClassName(line.variance),
              )}
            >
              {formatLineVariance(line)}
            </span>
          </div>
        </div>

        {line.note ? (
          <div className="break-words text-2xs italic text-muted-foreground">
            📝 {line.note}
          </div>
        ) : null}
      </ItemContent>
    </Item>
  );
}
