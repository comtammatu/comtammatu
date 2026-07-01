"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  CircleX as IconCircleX,
  CircleCheck as IconCircleCheck,
  Plus as IconPlus,
  Save as IconSave,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { Input } from "@comtammatu/ui/components/input";
import { Item } from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Combobox } from "@/components/form";
import { messages } from "@lib/messages";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import {
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import {
  createGrnFromPo,
  deletePurchaseOrderLine,
  updatePurchaseOrderStatus,
  upsertPurchaseOrderLine,
} from "../../procurement-actions";
import type { IngredientRow } from "../../page";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";

const poCopy = messages.inventory.po;
const poDetailCopy = poCopy.detail;
const inventoryCommon = messages.inventory.common;

export type PODetail = {
  id: number;
  code: string;
  status: string;
  supplier: string;
  date: string;
  sentAt: string;
  total: number;
  tax: number;
  grandTotal: number;
  supplierInfo: { address: string; contact: string; payment: string };
  items: Array<{
    lineId: number;
    ingredientId: number;
    name: string;
    sku: string;
    qty: number;
    unit: string;
    price: number | null;
    total: number;
    variance: number;
    trend: "up" | "down" | "stable";
  }>;
};

function VarianceBadge({ variance }: { variance: number }) {
  const variant =
    variance > 0 ? "destructive" : variance < 0 ? "success" : "secondary";
  return (
    <Badge variant={variant}>
      {variance > 0 ? "+" : ""}
      {variance}%
    </Badge>
  );
}

type EditablePoLine = PODetail["items"][number] & { dirty: boolean };

function computePoLineTotal(line: Pick<EditablePoLine, "qty" | "price">) {
  return Number((line.qty * (line.price ?? 0)).toFixed(2));
}

export function PODetailClient({
  po,
  ingredients,
  isOwner = false,
  auditLogs = [],
  purchaseOrdersBasePath = "/inventory/purchase-orders",
  afterCreateGrnHref,
}: {
  po: PODetail;
  ingredients: IngredientRow[];
  isOwner?: boolean;
  auditLogs?: AuditLogRow[];
  purchaseOrdersBasePath?: string;
  afterCreateGrnHref?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const supplierInfoAvailable = [
    po.supplierInfo.address,
    po.supplierInfo.contact,
    po.supplierInfo.payment,
  ].some((value) => value && value !== "—");
  // Owner force-edit: allow on any non-cancelled status. Non-owner: draft only.
  const canEditLines =
    po.status !== "cancelled" && (po.status === "draft" || isOwner);
  const canSendPo = po.status === "draft";
  const canCancelPo = po.status === "draft" || po.status === "sent";
  const canCreateGrn =
    po.status === "sent" || po.status === "partially_received";
  const statusBadge = getStatusBadgeMeta("inventory", po.status);
  const [lines, setLines] = useState<EditablePoLine[]>(() =>
    po.items.map((item) => ({ ...item, dirty: false })),
  );
  const [addIngredientId, setAddIngredientId] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const totalAmount = useMemo(
    () => lines.reduce((sum, item) => sum + computePoLineTotal(item), 0),
    [lines],
  );
  const taxAmount = 0;
  const grandTotal = totalAmount + taxAmount;

  function patchLine(index: number, patch: Partial<EditablePoLine>) {
    setLines((current) => {
      const next = current.slice();
      const existing = next[index];
      if (!existing) return current;
      const merged = { ...existing, ...patch };
      next[index] = {
        ...merged,
        total: computePoLineTotal(merged),
        dirty: true,
      };
      return next;
    });
  }

  function handleAddIngredientChange(value: string) {
    setAddIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    setAddUnit(ingredient?.purchase_unit ?? ingredient?.unit ?? "");
    setAddPrice(
      ingredient?.unit_cost != null ? String(Number(ingredient.unit_cost)) : "",
    );
  }

  function resetAddLine() {
    setAddIngredientId("");
    setAddQty("");
    setAddUnit("");
    setAddPrice("");
  }

  function handleSaveLine(index: number) {
    const line = lines[index];
    if (!line) return;
    if (line.qty <= 0 || !line.unit.trim()) {
      toast.error(poDetailCopy.invalidLine);
      return;
    }

    startTransition(async () => {
      const res = await upsertPurchaseOrderLine({
        poId: po.id,
        ingredientId: line.ingredientId,
        quantity: line.qty,
        unit: line.unit.trim(),
        unitPriceEst: line.price,
      });
      if (!res.success) {
        toast.error(res.error ?? poDetailCopy.saveLineFailed);
        return;
      }
      setLines((current) =>
        current.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                total: computePoLineTotal(item),
                dirty: false,
              }
            : item,
        ),
      );
      toast.success(poDetailCopy.saveLineOk);
      router.refresh();
    });
  }

  function handleAddLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredientId = Number(addIngredientId);
    const qty = Number(addQty);
    const price = addPrice.trim() ? Number(addPrice) : null;
    const ingredient = ingredients.find((item) => item.id === ingredientId);

    if (!ingredientId || !ingredient) {
      toast.error(poDetailCopy.chooseIngredient);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !addUnit.trim()) {
      toast.error(poDetailCopy.invalidLine);
      return;
    }
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      toast.error(poDetailCopy.invalidUnitPrice);
      return;
    }

    startTransition(async () => {
      const res = await upsertPurchaseOrderLine({
        poId: po.id,
        ingredientId,
        quantity: qty,
        unit: addUnit.trim(),
        unitPriceEst: price,
      });
      if (!res.success || !res.data) {
        toast.error(res.error ?? poDetailCopy.addLineFailed);
        return;
      }

      const row = res.data as { id: number };
      const nextLine: EditablePoLine = {
        lineId: row.id,
        ingredientId,
        name: ingredient.name,
        sku: ingredient.sku ?? "",
        qty,
        unit: addUnit.trim(),
        price,
        total: computePoLineTotal({ qty, price }),
        variance: 0,
        trend: "stable",
        dirty: false,
      };
      setLines((current) => {
        const existingIndex = current.findIndex(
          (item) => item.ingredientId === ingredientId,
        );
        if (existingIndex < 0) return [...current, nextLine];
        return current.map((item, itemIndex) =>
          itemIndex === existingIndex ? nextLine : item,
        );
      });
      resetAddLine();
      toast.success(poDetailCopy.saveLineOk);
      router.refresh();
    });
  }

  async function handleDeleteLine(line: EditablePoLine) {
    const ok = await confirm({
      title: poDetailCopy.deleteLineTitle,
      description: line.name,
      variant: "destructive",
      confirmText: poDetailCopy.deleteLineAction,
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deletePurchaseOrderLine({
        poId: po.id,
        lineId: line.lineId,
      });
      if (!res.success) {
        toast.error(res.error ?? poDetailCopy.deleteLineFailed);
        return;
      }
      setLines((current) =>
        current.filter((item) => item.lineId !== line.lineId),
      );
      toast.success(poDetailCopy.deleteLineOk);
      router.refresh();
    });
  }

  const lineColumns: DataTableColumn<EditablePoLine>[] = [
    {
      key: "item",
      header: poDetailCopy.item,
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-bold">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.sku}</span>
          {canEditLines ? (
            <Input
              value={item.unit}
              readOnly
              aria-readonly="true"
              className="mt-2 h-8 max-w-24"
              aria-label={FORM_VI.unit}
            />
          ) : null}
        </div>
      ),
    },
    {
      key: "qty",
      header: FORM_VI.quantity,
      className: "text-right font-mono tabular-nums",
      render: (item, index) =>
        canEditLines ? (
          <FormattedNumberInput
            value={String(item.qty)}
            onValueChange={(value) =>
              patchLine(index, { qty: Number(value || 0) })
            }
            maxFractionDigits={3}
            className="h-8 text-right"
          />
        ) : (
          item.qty
        ),
    },
    {
      key: "price",
      header: FORM_VI.unitPrice,
      className: "text-right font-mono tabular-nums",
      render: (item, index) =>
        canEditLines ? (
          <FormattedNumberInput
            value={item.price != null ? String(item.price) : ""}
            onValueChange={(value) =>
              patchLine(index, { price: value ? Number(value) : null })
            }
            maxFractionDigits={0}
            className="h-8 text-right"
          />
        ) : item.price != null ? (
          inventoryCommon.currencyCompact(formatVND(item.price))
        ) : (
          inventoryCommon.noValue
        ),
    },
    {
      key: "amount",
      header: FORM_VI.amount,
      className: "text-right font-mono tabular-nums font-semibold",
      render: (item) =>
        inventoryCommon.currencyCompact(formatVND(computePoLineTotal(item))),
    },
    {
      key: "variance",
      header: poDetailCopy.priceVariance,
      className: "text-right",
      render: (item) => <VarianceBadge variance={item.variance} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      render: (item, index) =>
        canEditLines ? (
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={isPending || !item.dirty}
              onClick={() => handleSaveLine(index)}
              aria-label={poDetailCopy.saveLineAria}
            >
              <IconSave className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isPending}
              onClick={() => void handleDeleteLine(item)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={poDetailCopy.deleteLineAria}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        ) : null,
    },
  ];

  function handleSendPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "sent");
      if (!res.success) {
        toast.error(res.error ?? poDetailCopy.sendFailed);
        return;
      }
      toast.success(poDetailCopy.sendOk);
      router.refresh();
    });
  }

  function handleCancelPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "cancelled");
      if (!res.success) {
        toast.error(res.error ?? poDetailCopy.cancelFailed);
        return;
      }
      toast.success(poDetailCopy.cancelOk);
      router.refresh();
    });
  }

  function handleCreateGrn() {
    startTransition(async () => {
      const res = await createGrnFromPo(po.id);
      if (!res.success || !res.data) {
        toast.error(res.error ?? poDetailCopy.createGrnFailed);
        return;
      }

      const created = res.data as { id: number };
      toast.success(poDetailCopy.createGrnOk);
      router.push(afterCreateGrnHref ?? `/inventory/grn/${created.id}`);
    });
  }

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={po.code}
        description={poDetailCopy.meta(po.supplier, po.date, po.sentAt)}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <Link
            href={purchaseOrdersBasePath}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {tRoute("/inventory/purchase-orders", "heading")}
          </Link>
        }
        actions={
          canSendPo ? (
            <Button
              type="button"
              size="lg"
              disabled={isPending}
              onClick={handleSendPo}
            >
              <IconCircleCheck className="size-4" />
              {poDetailCopy.sendPo}
            </Button>
          ) : canCreateGrn ? (
            <Button
              type="button"
              size="lg"
              disabled={isPending}
              onClick={handleCreateGrn}
            >
              <IconCircleCheck className="size-4" />
              {poDetailCopy.createGrnStep}
            </Button>
          ) : po.status !== "cancelled" ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button type="button" size="lg" disabled>
                      <IconCircleCheck className="size-4" />
                      {poDetailCopy.createGrnStep}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {poDetailCopy.createGrnDisabledHint}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null
        }
        tabs={
          <AppPageTabs
            items={[
              { value: "overview", label: "Tổng quan" },
              { value: "lines", label: "Dòng", count: lines.length },
              { value: "history", label: "Lịch sử", count: auditLogs.length },
            ]}
          >
            <TabsContent value="overview">
              <div className="flex flex-col gap-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-lg border bg-card p-4">
                    <Badge variant="secondary">{poCopy.supplierRequired}</Badge>
                    <p className="mt-3 text-xl font-semibold">{po.supplier}</p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <Badge variant="secondary">{poDetailCopy.goodsTotal}</Badge>
                    <p className="mt-3 text-xl font-semibold">
                      {messages.inventory.common.currency(
                        formatVND(totalAmount),
                      )}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-4">
                    <Badge variant="secondary">{FORM_VI.totalAmount}</Badge>
                    <p className="mt-3 text-2xl font-semibold text-primary">
                      {messages.inventory.common.currency(
                        formatVND(grandTotal),
                      )}
                    </p>
                  </div>
                </div>

                <AppSection contentClassName="py-4">
                  <div className="flex justify-center">
                    <TimelineStepper
                      steps={[
                        {
                          label: poDetailCopy.steps.draft,
                          date: po.date,
                          completed: true,
                        },
                        {
                          label: poDetailCopy.steps.sent,
                          date: po.sentAt,
                          completed: po.status !== "draft",
                        },
                        {
                          label: poDetailCopy.steps.waitingInspection,
                          active: po.status === "sent",
                          date:
                            po.status === "sent"
                              ? poDetailCopy.steps.waitingInspectionHint
                              : undefined,
                        },
                        {
                          label: poDetailCopy.steps.hasGrn,
                          completed: po.status === "received",
                          active: po.status === "partially_received",
                          date:
                            po.status === "partially_received"
                              ? poDetailCopy.steps.partialReceivedHint
                              : undefined,
                        },
                      ]}
                    />
                  </div>
                </AppSection>

                <PoOverviewLinesPreview
                  lines={lines}
                  onViewAll={() =>
                    router.replace("?tab=lines", { scroll: false })
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="lines">
              <div className="flex flex-col gap-4">
                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <AppSection
                      className="overflow-hidden"
                      title={poDetailCopy.itemCatalogTitle}
                      description={poDetailCopy.itemCatalogDescription(
                        lines.length,
                      )}
                      contentFlush
                    >
                      <DataTable
                        className="p-4 md:p-0"
                        columns={lineColumns}
                        data={lines}
                        getRowKey={(item) => item.lineId}
                        mobileCardRender={(item, index) => (
                          <PoLineMobileCard
                            item={item}
                            index={index}
                            canEditLines={canEditLines}
                            isPending={isPending}
                            patchLine={patchLine}
                            onSaveLine={handleSaveLine}
                            onDeleteLine={(line) => void handleDeleteLine(line)}
                          />
                        )}
                        mobileFooter={
                          <div className="rounded-md border bg-muted/20 p-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">
                                {FORM_VI.totalAmount}
                              </span>
                              <span className="font-mono font-semibold tabular-nums text-primary">
                                {inventoryCommon.currencyCompact(
                                  formatVND(grandTotal),
                                )}
                              </span>
                            </div>
                          </div>
                        }
                        desktopFooterRows={[
                          {
                            key: "goods-total",
                            className: "border-border",
                            cells: [
                              {
                                key: "label",
                                colSpan: 3,
                                className:
                                  "text-right text-sm text-muted-foreground",
                                content: poDetailCopy.goodsTotal,
                              },
                              {
                                key: "value",
                                className:
                                  "text-right font-mono font-semibold tabular-nums",
                                content: inventoryCommon.currencyCompact(
                                  formatVND(totalAmount),
                                ),
                              },
                              { key: "actions", colSpan: 2, content: null },
                            ],
                          },
                          {
                            key: "tax",
                            className: "border-border",
                            cells: [
                              {
                                key: "label",
                                colSpan: 3,
                                className:
                                  "text-right text-sm text-muted-foreground",
                                content: FORM_VI.tax,
                              },
                              {
                                key: "value",
                                className: "text-right font-mono tabular-nums",
                                content: inventoryCommon.currencyCompact(
                                  formatVND(taxAmount),
                                ),
                              },
                              { key: "actions", colSpan: 2, content: null },
                            ],
                          },
                          {
                            key: "grand-total",
                            className: "border-border",
                            cells: [
                              {
                                key: "label",
                                colSpan: 3,
                                className: "text-right text-sm font-bold",
                                content: FORM_VI.totalAmount,
                              },
                              {
                                key: "value",
                                className:
                                  "text-right font-mono font-bold tabular-nums text-primary",
                                content: inventoryCommon.currencyCompact(
                                  formatVND(grandTotal),
                                ),
                              },
                              { key: "actions", colSpan: 2, content: null },
                            ],
                          },
                        ]}
                      />

                      {canEditLines ? (
                        <form
                          onSubmit={handleAddLine}
                          className="grid gap-3 border-t bg-muted/5 p-4 sm:grid-cols-2 lg:grid-cols-5"
                        >
                          <Combobox
                            value={addIngredientId}
                            onValueChange={handleAddIngredientChange}
                            options={ingredients
                              .filter((ingredient) => ingredient.is_active)
                              .map((ingredient) => ({
                                value: String(ingredient.id),
                                label: ingredient.name,
                                hint:
                                  ingredient.purchase_unit ?? ingredient.unit,
                                keywords: [
                                  ingredient.sku ?? "",
                                  ingredient.category ?? "",
                                ],
                              }))}
                            placeholder={poCopy.ingredientPlaceholder}
                            searchPlaceholder={
                              poCopy.ingredientSearchPlaceholder
                            }
                            triggerClassName="h-9 border-dashed"
                          />
                          <FormattedNumberInput
                            value={addQty}
                            onValueChange={setAddQty}
                            maxFractionDigits={3}
                            placeholder={poCopy.quantityShort}
                            className="h-9"
                            required
                          />
                          <Input
                            value={addUnit}
                            readOnly
                            aria-readonly="true"
                            placeholder={poCopy.unitShort}
                            className="h-9"
                            required
                          />
                          <FormattedNumberInput
                            value={addPrice}
                            onValueChange={setAddPrice}
                            maxFractionDigits={0}
                            placeholder={poCopy.pricePlaceholder}
                            className="h-9"
                          />
                          <Button
                            type="submit"
                            disabled={isPending || !addIngredientId}
                            className="h-9"
                          >
                            <IconPlus className="size-4" />
                            {ACTIONS_VI.add}
                          </Button>
                        </form>
                      ) : null}
                    </AppSection>
                  </div>

                  <div className="flex flex-col gap-4">
                    <AppSection
                      title={poDetailCopy.summaryTitle}
                      contentClassName="flex flex-col gap-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {poDetailCopy.itemCount}
                        </span>
                        <span className="font-semibold">{lines.length}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {poDetailCopy.goodsTotal}
                        </span>
                        <span className="font-semibold">
                          {inventoryCommon.currencyCompact(
                            formatVND(totalAmount),
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-muted-foreground">
                          {FORM_VI.tax}
                        </span>
                        <span className="font-semibold">
                          {inventoryCommon.currencyCompact(
                            formatVND(taxAmount),
                          )}
                        </span>
                      </div>
                      <div className="border-t border-border pt-3">
                        <p className="text-muted-foreground">
                          {FORM_VI.totalAmount}
                        </p>
                        <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-primary">
                          {inventoryCommon.currencyCompact(
                            formatVND(grandTotal),
                          )}
                        </p>
                      </div>
                    </AppSection>

                    <AppSection title={poDetailCopy.supplierInfoTitle}>
                      {supplierInfoAvailable ? (
                        <div className="flex flex-col gap-3 text-sm">
                          <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">
                              {poDetailCopy.invoiceAddress}
                            </p>
                            <p className="mt-1 break-words font-medium">
                              {po.supplierInfo.address}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">
                              {poDetailCopy.contactPerson}
                            </p>
                            <p className="mt-1 font-medium">
                              {po.supplierInfo.contact}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-wider text-muted-foreground">
                              {poDetailCopy.paymentTerm}
                            </p>
                            <p className="mt-1 font-medium">
                              {po.supplierInfo.payment}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          {poDetailCopy.supplierInfoEmpty}
                        </div>
                      )}
                    </AppSection>
                  </div>
                </div>

                <AppDetailFooter
                  leading={
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isPending || !canCancelPo}
                      size="touch"
                      className="rounded-full px-6 font-bold text-destructive"
                      onClick={handleCancelPo}
                    >
                      <IconCircleX className="size-5" />
                      {poDetailCopy.cancelPo}
                    </Button>
                  }
                  trailing={
                    <Button
                      type="button"
                      disabled={isPending || (!canSendPo && !canCreateGrn)}
                      size="touch"
                      className="rounded-full px-10 font-bold"
                      onClick={canSendPo ? handleSendPo : handleCreateGrn}
                    >
                      <IconCircleCheck className="size-5" />
                      {canSendPo
                        ? poDetailCopy.sendPo
                        : poDetailCopy.createGrnStep}
                    </Button>
                  }
                />
              </div>
            </TabsContent>

            <TabsContent value="history">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
  );
}

function PoLineMobileCard({
  item,
  index,
  canEditLines,
  isPending,
  patchLine,
  onSaveLine,
  onDeleteLine,
}: {
  item: EditablePoLine;
  index: number;
  canEditLines: boolean;
  isPending: boolean;
  patchLine: (index: number, patch: Partial<EditablePoLine>) => void;
  onSaveLine: (index: number) => void;
  onDeleteLine: (line: EditablePoLine) => void;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.sku}</p>
        </div>
        <div className="flex items-center gap-2">
          <VarianceBadge variance={item.variance} />
          {canEditLines ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isPending}
              onClick={() => onDeleteLine(item)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={poDetailCopy.deleteLineAria}
            >
              <IconTrash className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">{FORM_VI.quantity}</p>
          {canEditLines ? (
            <FormattedNumberInput
              value={String(item.qty)}
              onValueChange={(value) =>
                patchLine(index, { qty: Number(value || 0) })
              }
              maxFractionDigits={3}
              className="h-9"
            />
          ) : (
            <p className="font-semibold">
              {item.qty} {item.unit}
            </p>
          )}
        </div>
        <div>
          <p className="text-muted-foreground">{FORM_VI.unitPrice}</p>
          {canEditLines ? (
            <FormattedNumberInput
              value={item.price != null ? String(item.price) : ""}
              onValueChange={(value) =>
                patchLine(index, { price: value ? Number(value) : null })
              }
              maxFractionDigits={0}
              className="h-9"
            />
          ) : (
            <p className="font-semibold">
              {item.price != null
                ? inventoryCommon.currencyCompact(formatVND(item.price))
                : inventoryCommon.noValue}
            </p>
          )}
        </div>
        {canEditLines ? (
          <div className="col-span-2">
            <p className="text-muted-foreground">{FORM_VI.unit}</p>
            <Input
              value={item.unit}
              readOnly
              aria-readonly="true"
              className="h-9"
            />
          </div>
        ) : null}
        <div className="col-span-2">
          <p className="text-muted-foreground">{FORM_VI.amount}</p>
          <p className="font-semibold text-primary">
            {inventoryCommon.currencyCompact(
              formatVND(computePoLineTotal(item)),
            )}
          </p>
        </div>
      </div>
      {canEditLines ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending || !item.dirty}
          className="mt-4"
          onClick={() => onSaveLine(index)}
        >
          <IconSave className="size-4" />
          {poDetailCopy.saveLine}
        </Button>
      ) : null}
    </div>
  );
}

const PO_PREVIEW_LIMIT = 10;

function PoOverviewLinesPreview({
  lines,
  onViewAll,
}: {
  lines: EditablePoLine[];
  onViewAll: () => void;
}) {
  if (lines.length === 0) return null;

  const sorted = [...lines].sort((a, b) => b.total - a.total);
  const preview = sorted.slice(0, PO_PREVIEW_LIMIT);
  const hasMore = sorted.length > PO_PREVIEW_LIMIT;
  const columns: DataTableColumn<EditablePoLine>[] = [
    {
      key: "name",
      header: FORM_VI.name,
      render: (line) => (
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
      header: FORM_VI.quantity,
      className: "text-right",
      render: (line) => (
        <span className="font-mono tabular-nums">
          {line.qty} {line.unit}
        </span>
      ),
    },
    {
      key: "unitPrice",
      header: FORM_VI.unitPrice,
      className: "text-right",
      render: (line) => (
        <span className="font-mono tabular-nums">
          {line.price != null
            ? inventoryCommon.currencyCompact(formatVND(line.price))
            : inventoryCommon.noValue}
        </span>
      ),
    },
    {
      key: "amount",
      header: FORM_VI.amount,
      className: "text-right",
      render: (line) => (
        <span className="font-mono font-semibold tabular-nums">
          {inventoryCommon.currencyCompact(formatVND(line.total))}
        </span>
      ),
    },
  ];

  return (
    <AppSection
      title={poDetailCopy.overviewLinesTitle}
      headerHint={
        hasMore
          ? poDetailCopy.overviewLinesPreviewHint(PO_PREVIEW_LIMIT)
          : undefined
      }
      contentFlush
    >
      <DataTable
        columns={columns}
        data={preview}
        getRowKey={(line) => line.lineId}
        emptyTitle={poDetailCopy.overviewLinesTitle}
        mobileCardRender={(line) => (
          <Item variant="outline" className="flex-col items-stretch gap-2 p-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{line.name}</div>
              {line.sku ? (
                <div className="font-mono text-xs text-muted-foreground">
                  {line.sku}
                </div>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">{FORM_VI.quantity}</div>
                <div className="font-mono tabular-nums">
                  {line.qty} {line.unit}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{FORM_VI.unitPrice}</div>
                <div className="font-mono tabular-nums">
                  {line.price != null
                    ? inventoryCommon.currencyCompact(formatVND(line.price))
                    : inventoryCommon.noValue}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">{FORM_VI.amount}</div>
                <div className="font-mono font-semibold tabular-nums">
                  {inventoryCommon.currencyCompact(formatVND(line.total))}
                </div>
              </div>
            </div>
          </Item>
        )}
      />
      {hasMore ? (
        <div className="border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onViewAll}
            className="text-primary"
          >
            {poDetailCopy.viewAllLines(sorted.length)}
          </Button>
        </div>
      ) : null}
    </AppSection>
  );
}
