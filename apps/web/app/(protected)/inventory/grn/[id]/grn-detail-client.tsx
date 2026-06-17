"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { PhotoUploadInput } from "../../_components/photo-upload-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  TriangleAlert as IconAlertTriangle,
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  Save as IconDeviceFloppy,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { DocumentStockCorrectionDialog } from "../../_components/document-stock-correction-dialog";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { formatVND } from "../../_lib/format";
import { KpiCard } from "@/components/kpi/kpi-card";
import { confirmGrn } from "../../procurement-actions";
import { amendGrnLine, deleteGrnLine, upsertGrnLine } from "../../grn-actions";
import { tRoute } from "../../_lib/dictionary";
import { m, messages } from "@lib/messages";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";
import type { IngredientRow } from "../../page";

import { ACTIONS_VI } from "@comtammatu/shared/messages";

const grnCopy = messages.inventory.grn;
const inventoryCommon = messages.inventory.common;

type GRNDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  poQuantity: number | null;
  poUnitPrice: number | null;
  required: number;
  // "Số đã giao" (gross delivered by the supplier). Stock impact = actual − rejected.
  actual: number;
  // Net good quantity into stock = actual − rejected (derived in page.tsx)
  accepted: number;
  rejected: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  priceOverrideNote: string;
  priceOverridePhotoUrl: string;
  priceVariancePct: number | null;
  requiresReview: boolean;
  shortDeliveryAction: "accept_and_close" | "wait_backorder" | null;
  unit: string;
  cost: number;
  lot: string;
  expiry: string;
  expiryDisplay: string;
  temp: string | null;
  qualityStatus: "accepted" | "rejected" | "partial";
  status: string;
};

export type GRNDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId?: number;
  branchId: number;
  supplierId: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: GRNDetailItem[];
  qcSettings: {
    qtyShortTolerancePct: number;
    priceVarianceWarnPct: number;
    priceVarianceReviewPct: number;
    rejectRequiresPhoto: boolean;
  };
};

type EditableLine = GRNDetailItem & { dirty: boolean };

function deriveVariance(
  unitCost: number,
  poUnitPrice: number | null,
): number | null {
  if (poUnitPrice == null || poUnitPrice === 0) return null;
  return Number((((unitCost - poUnitPrice) / poUnitPrice) * 100).toFixed(2));
}

export function GRNDetailClient({
  grn,
  ingredients,
  canAdjustStock,
  canAmendConfirmed = false,
  auditLogs = [],
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  canAdjustStock: boolean;
  canAmendConfirmed?: boolean;
  auditLogs?: AuditLogRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Device-derived, not param-derived: the old `?m=1` flag had no setter
  // anywhere in the codebase, so the mobile post-confirm navigation and
  // back-link paths below never activated for phone receivers.
  const isMobile = useIsMobile() === true;
  const isReview = searchParams.get("review") === "1";
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isAmending, startAmend] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [amendingLine, setAmendingLine] = useState<EditableLine | null>(null);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    grn.items.map((it) => ({ ...it, dirty: false })),
  );

  const isDraft = grn.status === "draft";
  const isConfirmed = grn.status === "confirmed";
  const showAmendAffordance = canAmendConfirmed && isConfirmed;
  const qc = grn.qcSettings;

  const stats = useMemo(() => {
    const acceptedLines = lines.filter(
      (l) => l.qualityStatus !== "rejected" && l.actual - l.rejected > 0,
    ).length;
    const rejectedLines = lines.filter(
      (l) => l.qualityStatus === "rejected" || l.rejected > 0,
    ).length;
    const reviewLines = lines.filter((l) => {
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      return (
        l.requiresReview ||
        (variance != null && Math.abs(variance) > qc.priceVarianceReviewPct)
      );
    }).length;
    // Total received value = cost × (delivered − rejected)
    const total = lines.reduce(
      (sum, l) => sum + l.cost * (l.actual - l.rejected),
      0,
    );
    return { acceptedLines, rejectedLines, reviewLines, total };
  }, [lines, qc.priceVarianceReviewPct]);

  const dirtyLines = lines.filter((l) => l.dirty);

  function patch(idx: number, p: Partial<EditableLine>) {
    setLines((prev) => {
      const next = prev.slice();
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...p, dirty: true };
      return next;
    });
  }

  async function handleSave() {
    if (dirtyLines.length === 0) {
      notify.info(messages.inventory.grn.saveEmpty);
      return;
    }
    startSave(async () => {
      let okCount = 0;
      for (const l of dirtyLines) {
        const res = await upsertGrnLine({
          grnId: grn.id,
          ingredientId: l.ingredientId,
          receivedQuantity: l.actual,
          unit: l.unit,
          unitCost: l.cost,
          qualityStatus: l.qualityStatus,
          rejectedQuantity: l.rejected,
          rejectionReason: l.rejectionReason || null,
          rejectedPhotoUrl: l.rejectedPhotoUrl || null,
          priceOverrideNote: l.priceOverrideNote || null,
          priceOverridePhotoUrl: l.priceOverridePhotoUrl || null,
          shortDeliveryAction: l.shortDeliveryAction,
          batchNumber: l.lot || null,
          expiryDate: l.expiry || null,
        });
        if (!res.success) {
          notify.error(
            m(messages.inventory.grn.saveLinesFailed, {
              name: l.name,
              reason: res.error ?? grnCopy.saveLineFailed,
            }),
          );
          continue;
        }
        okCount++;
      }
      if (okCount > 0) {
        notify.success(
          m(messages.inventory.grn.saveLinesOk, {
            ok: okCount,
            total: dirtyLines.length,
          }),
        );
        // Mark saved rows clean; refresh server data via router
        setLines((prev) => prev.map((l) => ({ ...l, dirty: false })));
        router.refresh();
      }
    });
  }

  async function handleDeleteLine(line: EditableLine) {
    const ok = await confirm({
      title: grnCopy.deleteLineTitle,
      description: line.name,
      variant: "destructive",
      confirmText: grnCopy.deleteLineAction,
    });
    if (!ok) return;

    startSave(async () => {
      const res = await deleteGrnLine({
        grnId: grn.id,
        lineId: line.lineId,
      });
      if (!res.success) {
        notify.error(res.error ?? grnCopy.deleteLineFailed);
        return;
      }
      setLines((prev) => prev.filter((item) => item.lineId !== line.lineId));
      notify.success(grnCopy.deleteLineOk);
      router.refresh();
    });
  }

  function upsertLocalLine(line: EditableLine) {
    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.ingredientId === line.ingredientId,
      );
      if (existingIndex < 0) return [...prev, line];
      return prev.map((item, index) => (index === existingIndex ? line : item));
    });
    router.refresh();
  }

  function validateBeforeConfirm(): string | null {
    for (const l of lines) {
      if (l.rejected > l.actual) {
        return grnCopy.validation.rejectedExceedsDelivered(l.name);
      }
      if (l.rejected > 0 && !l.rejectionReason.trim()) {
        return grnCopy.validation.rejectReasonRequired(l.name);
      }
      if (
        qc.rejectRequiresPhoto &&
        l.rejected > 0 &&
        !l.rejectedPhotoUrl.trim()
      ) {
        return grnCopy.validation.rejectPhotoRequired(l.name);
      }
      const tolerance = qc.qtyShortTolerancePct;
      // Short delivery: the supplier delivered below the threshold. Uses `actual` (gross delivered) directly.
      if (
        l.poQuantity != null &&
        l.poQuantity > 0 &&
        l.actual < l.poQuantity * (1 - tolerance / 100) &&
        !l.shortDeliveryAction
      ) {
        return grnCopy.validation.shortageActionRequired(l.name, tolerance);
      }
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      if (
        variance != null &&
        Math.abs(variance) > qc.priceVarianceWarnPct &&
        !l.priceOverrideNote.trim()
      ) {
        return grnCopy.validation.priceReasonRequired(l.name, variance);
      }
    }
    return null;
  }

  async function handleConfirmGrn() {
    if (dirtyLines.length > 0) {
      notify.error(messages.inventory.grn.confirmBlockedByDirty);
      return;
    }
    const validationError = validateBeforeConfirm();
    if (validationError) {
      notify.error(validationError);
      return;
    }
    const ok = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      variant: "destructive",
      confirmText: grnCopy.confirmGrnAction,
    });
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmGrn(grn.id);
      if (!res.success) {
        notify.error(res.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      const reviewCount =
        (res.data && typeof res.data === "object" && !Array.isArray(res.data)
          ? (res.data as { review_count?: number }).review_count
          : 0) ?? 0;
      notify.success(
        reviewCount > 0
          ? m(messages.inventory.grn.confirmedWithReview, {
              count: reviewCount,
            })
          : messages.inventory.grn.confirmed,
      );
      if (isMobile) {
        router.push("/inventory/grn/new");
      } else if (grn.poId) {
        router.push(`/inventory/purchase-orders/${grn.poId}`);
      } else {
        router.push("/inventory/grn");
      }
    });
  }

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={grn.code}
        description={`${grn.supplier} • ${grn.date}`}
        badge={{
          children: getInventoryStatusLabel(grn.status),
          variant: getInventoryStatusBadgeVariant(grn.status),
        }}
        breadcrumb={
          <Link
            href={isMobile ? "/inventory/grn/new" : "/inventory/grn"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {isMobile ? grnCopy.back : tRoute("/inventory/grn", "heading")}
          </Link>
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: lines.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview" className="mt-4">
              <div className="space-y-6">
                {isReview && isDraft ? (
                  <Alert>
                    <IconInfoCircle className="size-4" />
                    <AlertDescription>
                      {grnCopy.draftSavedReviewHint}
                    </AlertDescription>
                  </Alert>
                ) : null}

                <div className="grid gap-3 md:grid-cols-4">
                  <KpiCard
                    label={grnCopy.linkedPo}
                    value={
                      grn.poCode && grn.poId ? (
                        <Link
                          href={`/inventory/purchase-orders/${grn.poId}`}
                          className="text-primary hover:underline"
                        >
                          {grn.poCode}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {inventoryCommon.noValue}
                        </span>
                      )
                    }
                  />
                  <KpiCard label={grnCopy.supplier} value={grn.supplier} />
                  <KpiCard
                    label={grnCopy.totalReceivedValue}
                    value={
                      <span className="text-primary">
                        {inventoryCommon.currency(formatVND(stats.total))}
                      </span>
                    }
                  />
                  <KpiCard
                    label={grnCopy.priceReviewNeeded}
                    value={
                      <span
                        className={
                          stats.reviewLines > 0 ? "text-destructive" : ""
                        }
                      >
                        {grnCopy.reviewRatio(stats.reviewLines, lines.length)}
                      </span>
                    }
                  />
                </div>

                <OverviewLinesPreview lines={lines} />
              </div>
            </TabsContent>

            <TabsContent value="lines" className="mt-4">
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <AppSection
                      className="overflow-hidden"
                      title={grnCopy.inspectionItemsTitle}
                      description={
                        isDraft
                          ? grnCopy.draftToleranceHint(
                              qc.qtyShortTolerancePct,
                              qc.priceVarianceWarnPct,
                              qc.priceVarianceReviewPct,
                            )
                          : grnCopy.finalizedLineCount(lines.length)
                      }
                      action={
                        isDraft ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setAddDialogOpen(true)}
                          >
                            <IconPlus className="size-4" />
                            {grnCopy.addLine}
                          </Button>
                        ) : null
                      }
                      contentClassName="space-y-4"
                    >
                      {lines.map((line, idx) => (
                        <LineRow
                          key={line.lineId}
                          tenantId={grn.tenantId}
                          grnId={grn.id}
                          line={line}
                          idx={idx}
                          isDraft={isDraft}
                          qc={qc}
                          showAmendAffordance={showAmendAffordance}
                          onChange={(p) => patch(idx, p)}
                          onDelete={() => void handleDeleteLine(line)}
                          onAmend={() => setAmendingLine(line)}
                        />
                      ))}
                    </AppSection>
                  </div>

                  <div className="space-y-4">
                    <AppSection
                      size="sm"
                      title={grnCopy.qcSummary}
                      contentClassName="space-y-3 text-sm"
                    >
                      <Row
                        label={grnCopy.acceptedLines}
                        value={`${stats.acceptedLines}/${lines.length}`}
                        tone="success"
                      />
                      <Row
                        label={grnCopy.rejectedLines}
                        value={String(stats.rejectedLines)}
                        tone={stats.rejectedLines > 0 ? "warning" : "default"}
                      />
                      <Row
                        label={grnCopy.priceReviewNeeded}
                        value={String(stats.reviewLines)}
                        tone={stats.reviewLines > 0 ? "warning" : "default"}
                      />
                    </AppSection>

                    <AppSection
                      tone="info"
                      size="sm"
                      title={grnCopy.totalStockValue}
                    >
                      <p className="font-mono text-xl font-semibold tabular-nums text-primary">
                        {inventoryCommon.currency(formatVND(stats.total))}
                      </p>
                    </AppSection>
                  </div>
                </div>

                <AppDetailFooter
                  leading={
                    <>
                      {!isDraft ? (
                        <Button asChild variant="ghost">
                          <Link
                            href={
                              isMobile
                                ? "/inventory/grn/new"
                                : grn.poId
                                  ? `/inventory/purchase-orders/${grn.poId}`
                                  : "/inventory/grn"
                            }
                          >
                            <IconArrowLeft className="size-5" />
                            {grnCopy.back}
                          </Link>
                        </Button>
                      ) : null}
                      {!isDraft && canAdjustStock && lines.length > 0 ? (
                        <DocumentStockCorrectionDialog
                          documentType="grn"
                          documentId={grn.id}
                          documentCode={grn.code}
                          branchOptions={[
                            {
                              id: grn.branchId,
                              name: grnCopy.receivingWarehouse,
                            },
                          ]}
                          itemOptions={lines.map((line) => ({
                            ingredientId: line.ingredientId,
                            name: line.name,
                            unit: line.unit,
                          }))}
                        />
                      ) : null}
                    </>
                  }
                  trailing={
                    isDraft ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSave}
                          disabled={isSaving || dirtyLines.length === 0}
                        >
                          <IconDeviceFloppy className="size-5" />
                          {grnCopy.saveChanges(dirtyLines.length)}
                        </Button>
                        <Button
                          type="button"
                          disabled={isConfirming || dirtyLines.length > 0}
                          onClick={handleConfirmGrn}
                        >
                          <IconCircleCheck className="size-5" />
                          {grnCopy.confirmGrnAction}
                        </Button>
                      </>
                    ) : null
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="history" className="mt-4">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
      <AddGrnLineDialog
        grn={grn}
        ingredients={ingredients}
        isOpen={addDialogOpen}
        isPending={isSaving}
        onOpenChange={setAddDialogOpen}
        onSaved={upsertLocalLine}
        startTransition={startSave}
      />
      <AmendOwnerDialog
        grnId={grn.id}
        line={amendingLine}
        isPending={isAmending}
        onClose={() => setAmendingLine(null)}
        onSaved={(updatedLine) => {
          setLines((prev) =>
            prev.map((item) =>
              item.lineId === updatedLine.lineId ? updatedLine : item,
            ),
          );
          setAmendingLine(null);
          router.refresh();
        }}
        startTransition={startAmend}
      />
    </AppPage>
  );
}

function AmendOwnerDialog({
  grnId,
  line,
  isPending,
  onClose,
  onSaved,
  startTransition,
}: {
  grnId: number;
  line: EditableLine | null;
  isPending: boolean;
  onClose: () => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState("");

  const isOpen = line !== null;

  function resetForm() {
    setQuantity("");
    setUnitCost("");
    setReason("");
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      resetForm();
      onClose();
    }
  }

  // Sync form fields when a new line is selected.
  if (line && quantity === "" && unitCost === "") {
    setQuantity(String(line.actual));
    setUnitCost(String(line.cost));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;

    const parsedQty = Number(quantity);
    const parsedCost = Number(unitCost);
    const trimmedReason = reason.trim();

    if (!Number.isFinite(parsedQty) || parsedQty < 0) {
      notify.error(grnCopy.validation.invalidQuantity);
      return;
    }
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      notify.error(grnCopy.validation.invalidUnitCost);
      return;
    }
    if (trimmedReason.length < 5) {
      notify.error(grnCopy.validation.reasonMinLength);
      return;
    }

    startTransition(async () => {
      const res = await amendGrnLine({
        grnId,
        lineId: line.lineId,
        receivedQuantity: parsedQty,
        unitCost: parsedCost,
        reason: trimmedReason,
      });
      if (!res.success) {
        notify.error(res.error ?? grnCopy.amend.failed);
        return;
      }
      notify.success(grnCopy.amend.success);
      onSaved({
        ...line,
        actual: parsedQty,
        accepted: parsedQty - line.rejected,
        cost: parsedCost,
        dirty: false,
      });
      resetForm();
    });
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent className="gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{grnCopy.amend.title}</SheetTitle>
        </SheetHeader>
        {line ? (
          <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 p-4">
            <Alert>
              <IconAlertTriangle className="size-4" />
              <AlertDescription>{grnCopy.amend.warning}</AlertDescription>
            </Alert>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="font-bold">{line.name}</p>
              <p className="text-xs text-muted-foreground">
                {grnCopy.amend.current(
                  line.actual,
                  line.unit,
                  line.cost.toLocaleString("vi-VN"),
                )}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amend-qty">{grnCopy.amend.quantityLabel}</Label>
                <FormattedNumberInput
                  id="amend-qty"
                  value={quantity}
                  onValueChange={setQuantity}
                  maxFractionDigits={3}
                  placeholder="0"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="amend-cost">
                  {grnCopy.amend.unitCostLabel}
                </Label>
                <FormattedNumberInput
                  id="amend-cost"
                  value={unitCost}
                  onValueChange={setUnitCost}
                  maxFractionDigits={0}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="amend-reason">{grnCopy.amend.reasonLabel}</Label>
              <Textarea
                id="amend-reason"
                rows={3}
                value={reason}
                placeholder={grnCopy.amend.reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>

            <SheetFooter className="border-t p-0 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isPending}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button type="submit" disabled={isPending}>
                <IconDeviceFloppy className="size-4" />
                {grnCopy.amend.saveAction}
              </Button>
            </SheetFooter>
          </form>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AddGrnLineDialog({
  grn,
  ingredients,
  isOpen,
  isPending,
  onOpenChange,
  onSaved,
  startTransition,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  isOpen: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setUnitCost("");
    setBatchNumber("");
    setExpiryDate("");
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    setUnit(ingredient?.purchase_unit ?? ingredient?.unit ?? "");
    setUnitCost(
      ingredient?.unit_cost != null ? String(Number(ingredient.unit_cost)) : "",
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : 0;
    const ingredient = ingredients.find(
      (item) => item.id === parsedIngredientId,
    );

    if (!parsedIngredientId || !ingredient) {
      notify.error(grnCopy.validation.chooseIngredient);
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      notify.error(grnCopy.validation.invalidReceivedQuantity);
      return;
    }
    if (!unit.trim()) {
      notify.error(grnCopy.validation.unitRequired);
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      notify.error(grnCopy.validation.invalidUnitCost);
      return;
    }

    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: parsedIngredientId,
        receivedQuantity: parsedQuantity,
        unit: unit.trim(),
        unitCost: parsedUnitCost,
        qualityStatus: "accepted",
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
        priceOverrideNote: null,
        priceOverridePhotoUrl: null,
        shortDeliveryAction: null,
        batchNumber: batchNumber.trim() || null,
        expiryDate: expiryDate || null,
      });
      if (!res.success || !res.data) {
        notify.error(res.error ?? grnCopy.saveLineFailed);
        return;
      }

      const row = res.data as { id: number };
      onSaved({
        lineId: row.id,
        ingredientId: parsedIngredientId,
        name: ingredient.name,
        sku: ingredient.sku ?? "",
        poQuantity: null,
        poUnitPrice: null,
        required: parsedQuantity,
        actual: parsedQuantity,
        accepted: parsedQuantity,
        rejected: 0,
        rejectionReason: "",
        rejectedPhotoUrl: "",
        priceOverrideNote: "",
        priceOverridePhotoUrl: "",
        priceVariancePct: null,
        requiresReview: false,
        shortDeliveryAction: null,
        unit: unit.trim(),
        cost: parsedUnitCost,
        lot: batchNumber.trim(),
        expiry: expiryDate,
        expiryDisplay: expiryDate || inventoryCommon.noValue,
        temp: null,
        qualityStatus: "accepted",
        status: "pass",
        dirty: false,
      });
      notify.success(grnCopy.addDialog.success);
      onOpenChange(false);
      resetForm();
    });
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <SheetContent className="gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{grnCopy.addDialog.title}</SheetTitle>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col gap-4 p-4">
          <div className="flex flex-col gap-1.5">
            <Label>{grnCopy.addDialog.ingredientLabel}</Label>
            <Combobox
              value={ingredientId}
              onValueChange={handleIngredientChange}
              options={ingredients
                .filter((ingredient) => ingredient.is_active)
                .map((ingredient) => ({
                  value: String(ingredient.id),
                  label: ingredient.name,
                  hint: ingredient.purchase_unit ?? ingredient.unit,
                  keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
                }))}
              placeholder={grnCopy.addDialog.ingredientPlaceholder}
              searchPlaceholder={grnCopy.addDialog.ingredientSearchPlaceholder}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-qty">
                {grnCopy.addDialog.quantityLabel}
              </Label>
              <FormattedNumberInput
                id="grn-line-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-unit">
                {grnCopy.addDialog.unitLabel}
              </Label>
              <Input
                id="grn-line-unit"
                value={unit}
                readOnly
                aria-readonly="true"
                placeholder="kg"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-cost">
                {grnCopy.addDialog.unitCostLabel}
              </Label>
              <FormattedNumberInput
                id="grn-line-cost"
                value={unitCost}
                onValueChange={setUnitCost}
                maxFractionDigits={0}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-batch">
                {grnCopy.addDialog.batchLabel}
              </Label>
              <Input
                id="grn-line-batch"
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                placeholder={inventoryCommon.noValue}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-expiry">
                {grnCopy.addDialog.expiryLabel}
              </Label>
              <Input
                id="grn-line-expiry"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </div>
          </div>

          <SheetFooter className="border-t p-0 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {ACTIONS_VI.cancel}
            </Button>
            <Button type="submit" disabled={isPending}>
              <IconPlus className="size-4" />
              {grnCopy.addDialog.saveAction}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

const PREVIEW_LIMIT = 10;

type GrnOverviewPreviewRow = {
  line: GRNDetailItem;
  acceptedQty: number;
  lineTotal: number;
};

function getGrnOverviewStatus({ line }: GrnOverviewPreviewRow): {
  label: string;
  variant: "destructive" | "warning" | "success";
} {
  const variance = deriveVariance(line.cost, line.poUnitPrice);
  const reviewFlagged =
    line.requiresReview || (variance != null && Math.abs(variance) > 10);
  const isRejected = line.qualityStatus === "rejected";
  return isRejected
    ? { label: grnCopy.rejectedLines, variant: "destructive" }
    : reviewFlagged
      ? { label: grnCopy.priceReviewNeeded, variant: "warning" }
      : { label: grnCopy.acceptedLines, variant: "success" };
}

function OverviewLinesPreview({ lines }: { lines: GRNDetailItem[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sorted = useMemo<GrnOverviewPreviewRow[]>(() => {
    return [...lines]
      .map((line) => {
        const acceptedQty = Math.max(0, line.actual - line.rejected);
        return {
          line,
          acceptedQty,
          lineTotal: Number((acceptedQty * line.cost).toFixed(2)),
        };
      })
      .sort((a, b) => b.lineTotal - a.lineTotal);
  }, [lines]);

  const preview = sorted.slice(0, PREVIEW_LIMIT);
  const hasMore = sorted.length > PREVIEW_LIMIT;
  const columns: DataTableColumn<GrnOverviewPreviewRow>[] = [
    {
      key: "name",
      header: grnCopy.lineHeaderName,
      render: ({ line }) => (
        <div>
          <div className="font-medium">{line.name}</div>
          {line.sku ? (
            <div className="font-mono text-xs text-muted-foreground">
              {line.sku}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: "quantity",
      header: grnCopy.lineHeaderQty,
      className: "text-right",
      render: ({ line, acceptedQty }) => (
        <span className="font-mono tabular-nums">
          {acceptedQty} {line.unit}
        </span>
      ),
    },
    {
      key: "cost",
      header: grnCopy.lineHeaderCost,
      className: "text-right",
      render: ({ line }) => (
        <span className="font-mono tabular-nums">
          {inventoryCommon.currency(formatVND(line.cost))}
        </span>
      ),
    },
    {
      key: "total",
      header: grnCopy.lineHeaderTotal,
      className: "text-right",
      render: ({ lineTotal }) => (
        <span className="font-mono font-semibold tabular-nums">
          {inventoryCommon.currency(formatVND(lineTotal))}
        </span>
      ),
    },
    {
      key: "status",
      header: grnCopy.lineHeaderStatus,
      className: "w-24 text-right",
      render: (row) => {
        const status = getGrnOverviewStatus(row);
        return <Badge variant={status.variant}>{status.label}</Badge>;
      },
    },
  ];

  function goToLinesTab() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "lines");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  if (lines.length === 0) {
    return (
      <AppSection title={grnCopy.overviewLinesTitle}>
        <p className="text-sm text-muted-foreground">
          {grnCopy.overviewLinesEmpty}
        </p>
      </AppSection>
    );
  }

  return (
    <AppSection
      title={grnCopy.overviewLinesTitle}
      headerHint={
        hasMore ? grnCopy.overviewLinesPreviewHint(PREVIEW_LIMIT) : undefined
      }
      contentFlush
    >
      <DataTable
        columns={columns}
        data={preview}
        getRowKey={({ line }) => line.lineId}
        emptyTitle={grnCopy.overviewLinesEmpty}
        mobileCardRender={(row) => {
          const status = getGrnOverviewStatus(row);
          return (
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{row.line.name}</div>
                  {row.line.sku ? (
                    <div className="font-mono text-xs text-muted-foreground">
                      {row.line.sku}
                    </div>
                  ) : null}
                </div>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderQty}
                  </div>
                  <div className="font-mono tabular-nums">
                    {row.acceptedQty} {row.line.unit}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderCost}
                  </div>
                  <div className="font-mono tabular-nums">
                    {inventoryCommon.currency(formatVND(row.line.cost))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    {grnCopy.lineHeaderTotal}
                  </div>
                  <div className="font-mono font-semibold tabular-nums">
                    {inventoryCommon.currency(formatVND(row.lineTotal))}
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      />
      {hasMore ? (
        <div className="border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={goToLinesTab}
            className="text-primary"
          >
            {grnCopy.viewAllLines(sorted.length)}
          </Button>
        </div>
      ) : null}
    </AppSection>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-primary"
        : "";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold ${toneClass}`}>{value}</span>
    </div>
  );
}

function LineRow({
  tenantId,
  grnId,
  line,
  idx,
  isDraft,
  qc,
  showAmendAffordance,
  onChange,
  onDelete,
  onAmend,
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine;
  idx: number;
  isDraft: boolean;
  qc: GRNDetail["qcSettings"];
  showAmendAffordance: boolean;
  onChange: (p: Partial<EditableLine>) => void;
  onDelete: () => void;
  onAmend: () => void;
}) {
  const variance = deriveVariance(line.cost, line.poUnitPrice);
  const variancesLabel =
    variance != null
      ? `${variance > 0 ? "+" : ""}${variance}%`
      : inventoryCommon.noValue;
  const varianceTone =
    variance == null
      ? "text-muted-foreground"
      : Math.abs(variance) > qc.priceVarianceReviewPct
        ? "text-destructive font-bold"
        : Math.abs(variance) > qc.priceVarianceWarnPct
          ? "text-warning font-semibold"
          : "text-muted-foreground";

  // Short delivery: supplier under the PO threshold. Uses gross delivered (actual) directly.
  const shortDeliveryRequired =
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual < line.poQuantity * (1 - qc.qtyShortTolerancePct / 100);

  if (!isDraft) {
    return (
      <div className="rounded-md border bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedDeliveredAccepted(
                line.required,
                line.actual,
                line.actual - line.rejected,
                line.rejected,
                line.unit,
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {showAmendAffordance ? (
              <Button type="button" variant="outline" size="sm" onClick={onAmend}>
                {grnCopy.amend.action}
              </Button>
            ) : null}
            {line.qualityStatus === "rejected" || line.rejected > 0 ? (
              <IconAlertTriangle className="size-5 text-warning" />
            ) : (
              <IconCircleCheck className="size-5 text-success" />
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <Stat label={grnCopy.line.importPrice}>
            {inventoryCommon.currency(formatVND(line.cost))}
          </Stat>
          <Stat label={grnCopy.line.poPrice}>
            {line.poUnitPrice != null
              ? inventoryCommon.currency(formatVND(line.poUnitPrice))
              : inventoryCommon.noValue}
          </Stat>
          <Stat label={grnCopy.line.priceVariance}>
            <span className={varianceTone}>{variancesLabel}</span>
          </Stat>
          <Stat label={grnCopy.line.expiry}>{line.expiryDisplay}</Stat>
        </div>
        {line.rejectionReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold">
              {grnCopy.line.rejectionReason}
            </span>{" "}
            {line.rejectionReason}
          </p>
        ) : null}
        {line.priceOverrideNote ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold">
              {grnCopy.line.priceOverrideReason}
            </span>{" "}
            {line.priceOverrideNote}
          </p>
        ) : null}
        {line.requiresReview ? (
          <Badge variant="destructive" className="mt-2">
            {grnCopy.line.reviewNeeded}
          </Badge>
        ) : null}
      </div>
    );
  }

  // Draft mode — editable
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {grnCopy.line.orderedPoPrice(
                line.poQuantity ?? inventoryCommon.noValue,
                line.unit,
              )}{" "}
              {line.poUnitPrice != null
                ? inventoryCommon.currency(formatVND(line.poUnitPrice))
                : inventoryCommon.noValue}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm ${varianceTone}`}>
              {grnCopy.line.priceVariance}: {variancesLabel}
            </span>
            {line.dirty ? (
              <Badge variant="outline" className="text-xs">
                {grnCopy.line.unsaved}
              </Badge>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-muted-foreground hover:text-destructive"
              aria-label={grnCopy.line.deleteLineAria}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field
            id={`actual-${idx}`}
            label={grnCopy.line.actualLabel(line.unit)}
          >
            <FormattedNumberInput
              id={`actual-${idx}`}
              maxFractionDigits={3}
              value={String(line.actual)}
              onValueChange={(value) =>
                onChange({ actual: Number(value || 0) })
              }
            />
          </Field>
          <Field
            id={`rejected-${idx}`}
            label={grnCopy.line.rejectedLabel(line.unit)}
          >
            <FormattedNumberInput
              id={`rejected-${idx}`}
              maxFractionDigits={3}
              value={String(line.rejected)}
              onValueChange={(value) =>
                onChange({
                  rejected: Number(value || 0),
                  qualityStatus:
                    Number(value || 0) > 0 && line.actual === 0
                      ? "rejected"
                      : Number(value || 0) > 0
                        ? "partial"
                        : "accepted",
                })
              }
            />
          </Field>
          <Field id={`cost-${idx}`} label={grnCopy.line.unitCostCurrency}>
            <FormattedNumberInput
              id={`cost-${idx}`}
              maxFractionDigits={0}
              value={String(line.cost)}
              onValueChange={(value) => onChange({ cost: Number(value || 0) })}
            />
          </Field>
          <Field id={`expiry-${idx}`} label={grnCopy.line.expiry}>
            <Input
              id={`expiry-${idx}`}
              type="date"
              value={line.expiry || ""}
              onChange={(e) => onChange({ expiry: e.target.value })}
            />
          </Field>
        </div>

        {line.rejected > 0 || line.qualityStatus === "rejected" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              id={`reason-${idx}`}
              label={grnCopy.line.rejectReasonRequired}
            >
              <Textarea
                id={`reason-${idx}`}
                rows={2}
                value={line.rejectionReason}
                placeholder={grnCopy.line.rejectReasonPlaceholder}
                onChange={(e) => onChange({ rejectionReason: e.target.value })}
              />
            </Field>
            <Field
              id={`reject-photo-${idx}`}
              label={grnCopy.line.proofPhotoLabel(qc.rejectRequiresPhoto)}
            >
              <PhotoUploadInput
                tenantId={tenantId}
                folder={`grn/${grnId}/rejected/${line.lineId}`}
                value={line.rejectedPhotoUrl || null}
                onChange={(url) => onChange({ rejectedPhotoUrl: url ?? "" })}
              />
            </Field>
          </div>
        ) : null}

        {variance != null && Math.abs(variance) > qc.priceVarianceWarnPct ? (
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              id={`override-${idx}`}
              label={grnCopy.line.priceOverrideRequired}
            >
              <Textarea
                id={`override-${idx}`}
                rows={2}
                value={line.priceOverrideNote}
                placeholder={
                  Math.abs(variance) > qc.priceVarianceReviewPct
                    ? grnCopy.line.reviewVariancePlaceholder(
                        variance,
                        qc.priceVarianceReviewPct,
                      )
                    : grnCopy.line.warnVariancePlaceholder(
                        variance,
                        qc.priceVarianceWarnPct,
                      )
                }
                onChange={(e) =>
                  onChange({ priceOverrideNote: e.target.value })
                }
              />
            </Field>
            {Math.abs(variance) > qc.priceVarianceReviewPct ? (
              <Field
                id={`override-photo-${idx}`}
                label={grnCopy.line.supplierInvoicePhoto}
              >
                <PhotoUploadInput
                  tenantId={tenantId}
                  folder={`grn/${grnId}/price-override/${line.lineId}`}
                  value={line.priceOverridePhotoUrl || null}
                  onChange={(url) =>
                    onChange({ priceOverridePhotoUrl: url ?? "" })
                  }
                />
              </Field>
            ) : null}
          </div>
        ) : null}

        {shortDeliveryRequired ? (
          <Field id={`short-${idx}`} label={grnCopy.line.shortageAction}>
            <Select
              value={line.shortDeliveryAction ?? ""}
              onValueChange={(v) =>
                onChange({
                  shortDeliveryAction: v as EditableLine["shortDeliveryAction"],
                })
              }
            >
              <SelectTrigger id={`short-${idx}`}>
                <SelectValue placeholder={grnCopy.line.shortagePlaceholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accept_and_close">
                  {grnCopy.line.acceptAndClose}
                </SelectItem>
                <SelectItem value="wait_backorder">
                  {grnCopy.line.waitBackorder}
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
        ) : null}

        <Field id={`lot-${idx}`} label={grnCopy.line.lot}>
          <Input
            id={`lot-${idx}`}
            value={line.lot}
            placeholder={inventoryCommon.noValue}
            onChange={(e) => onChange({ lot: e.target.value })}
          />
        </Field>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono">{children}</p>
    </div>
  );
}
