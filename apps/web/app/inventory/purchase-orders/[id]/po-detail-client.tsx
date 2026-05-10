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
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@comtammatu/ui/components/table";
import { Input } from "@comtammatu/ui/components/input";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Combobox, MultiSelectCombobox } from "@/components/form";
import { messages } from "@lib/messages";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import {
  AppDetailFooter,
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { AuditHistoryList } from "../../_components/audit-history-list";
import type { AuditLogRow } from "@/admin/_lib/audit";
import { TimelineStepper } from "../../_components/timeline-stepper";
import { formatVND } from "../../_lib/format";
import { tRoute } from "../../_lib/dictionary";
import {
  createGrnFromPo,
  deletePurchaseOrderLine,
  updatePurchaseOrderStatus,
  upsertPurchaseOrderLine,
} from "../../procurement-actions";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";
import type { IngredientRow } from "../../page";
import { parseInventoryBulkLines } from "../../_lib/bulk-line-parser";

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

type BulkPoLineDraft = {
  ingredient: IngredientRow;
  quantity: number;
  unit: string;
  price: number | null;
};

function computePoLineTotal(line: Pick<EditablePoLine, "qty" | "price">) {
  return Number((line.qty * (line.price ?? 0)).toFixed(2));
}

function getPoIngredientUnit(ingredient: IngredientRow) {
  return ingredient.purchase_unit || ingredient.unit || "";
}

function getPoIngredientPrice(ingredient: IngredientRow) {
  return ingredient.unit_cost != null ? Number(ingredient.unit_cost) : null;
}

function toEditablePoLine({
  lineId,
  draft,
  previous,
}: {
  lineId: number;
  draft: BulkPoLineDraft;
  previous?: EditablePoLine;
}): EditablePoLine {
  return {
    lineId,
    ingredientId: draft.ingredient.id,
    name: draft.ingredient.name,
    sku: draft.ingredient.sku ?? "",
    qty: draft.quantity,
    unit: draft.unit,
    price: draft.price,
    total: computePoLineTotal({
      qty: draft.quantity,
      price: draft.price,
    }),
    variance: previous?.variance ?? 0,
    trend: previous?.trend ?? "stable",
    dirty: false,
  };
}

export function PODetailClient({
  po,
  ingredients,
  isOwner = false,
  auditLogs = [],
}: {
  po: PODetail;
  ingredients: IngredientRow[];
  isOwner?: boolean;
  auditLogs?: AuditLogRow[];
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
  const [lines, setLines] = useState<EditablePoLine[]>(() =>
    po.items.map((item) => ({ ...item, dirty: false })),
  );
  const [addIngredientId, setAddIngredientId] = useState("");
  const [addQty, setAddQty] = useState("");
  const [addUnit, setAddUnit] = useState("");
  const [addPrice, setAddPrice] = useState("");
  const [bulkPasteText, setBulkPasteText] = useState("");
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);
  const totalAmount = useMemo(
    () => lines.reduce((sum, item) => sum + computePoLineTotal(item), 0),
    [lines],
  );
  const taxAmount = 0;
  const grandTotal = totalAmount + taxAmount;
  const activeIngredients = useMemo(
    () => ingredients.filter((ingredient) => ingredient.is_active),
    [ingredients],
  );

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

  function toBulkPoDraft(
    ingredient: IngredientRow,
    quantity = 1,
  ): BulkPoLineDraft {
    return {
      ingredient,
      quantity,
      unit: getPoIngredientUnit(ingredient),
      price: getPoIngredientPrice(ingredient),
    };
  }

  function handleBulkAddIngredients(ingredientIds: string[]) {
    setBulkIssues([]);
    const drafts = ingredientIds
      .map((id) => activeIngredients.find((item) => item.id === Number(id)))
      .filter((ingredient): ingredient is IngredientRow => Boolean(ingredient))
      .map((ingredient) => toBulkPoDraft(ingredient));

    handleSaveBulkLines(drafts);
  }

  function handleBulkPaste() {
    const result = parseInventoryBulkLines({
      text: bulkPasteText,
      items: activeIngredients,
      getUnit: getPoIngredientUnit,
    });
    setBulkIssues(result.issues);

    const draftsByIngredient = new Map<number, BulkPoLineDraft>();
    for (const { item, quantity } of result.parsed) {
      draftsByIngredient.set(item.id, toBulkPoDraft(item, Number(quantity)));
    }

    const drafts = [...draftsByIngredient.values()];
    if (drafts.length === 0) {
      toast.error(messages.inventory.common.bulk.noValidRows);
      return;
    }

    handleSaveBulkLines(drafts, () => {
      setBulkPasteText("");
    });
  }

  function handleSaveBulkLines(drafts: BulkPoLineDraft[], onDone?: () => void) {
    if (drafts.length === 0) return;

    startTransition(async () => {
      let okCount = 0;
      for (const draft of drafts) {
        if (draft.quantity <= 0 || !draft.unit.trim()) {
          continue;
        }
        const res = await upsertPurchaseOrderLine({
          poId: po.id,
          ingredientId: draft.ingredient.id,
          quantity: draft.quantity,
          unit: draft.unit.trim(),
          unitPriceEst: draft.price,
        });
        if (!res.success || !res.data) {
          toast.error(res.error ?? poDetailCopy.addLineFailed);
          continue;
        }

        const row = res.data as { id: number };
        setLines((current) => {
          const existingIndex = current.findIndex(
            (item) => item.ingredientId === draft.ingredient.id,
          );
          if (existingIndex < 0) {
            return [...current, toEditablePoLine({ lineId: row.id, draft })];
          }

          return current.map((item, itemIndex) =>
            itemIndex === existingIndex
              ? toEditablePoLine({
                  lineId: row.id,
                  draft,
                  previous: item,
                })
              : item,
          );
        });
        okCount++;
      }

      if (okCount > 0) {
        toast.success(messages.inventory.common.bulk.importedRows(okCount));
        setBulkIssues([]);
        onDone?.();
        router.refresh();
      }
    });
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
      router.push(`/inventory/grn/${created.id}`);
    });
  }

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title={po.code}
        description={poDetailCopy.meta(po.supplier, po.date, po.sentAt)}
        badge={{
          children: getInventoryStatusLabel(po.status),
          variant: getInventoryStatusBadgeVariant(po.status),
        }}
        breadcrumb={
          <Link
            href="/inventory/purchase-orders"
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
            <TabsContent value="overview" className="mt-4">
              <div className="space-y-6">
                <div className="grid gap-3 md:grid-cols-3">
                  <Card>
                    <CardContent>
                      <Badge variant="secondary">
                        {poCopy.supplierRequired}
                      </Badge>
                      <p className="mt-3 text-xl font-semibold">
                        {po.supplier}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <Badge variant="secondary">
                        {poDetailCopy.goodsTotal}
                      </Badge>
                      <p className="mt-3 text-xl font-semibold">
                        {messages.inventory.common.currency(
                          formatVND(totalAmount),
                        )}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <Badge variant="secondary">{FORM_VI.totalAmount}</Badge>
                      <p className="mt-3 text-2xl font-semibold text-primary">
                        {messages.inventory.common.currency(
                          formatVND(grandTotal),
                        )}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <AppSection contentClassName="py-6">
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

            <TabsContent value="lines" className="mt-4">
              <div className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <AppSection
                      className="overflow-hidden"
                      title={poDetailCopy.itemCatalogTitle}
                      description={poDetailCopy.itemCatalogDescription(
                        lines.length,
                      )}
                      contentClassName="p-0"
                    >
                      <div className="space-y-3 p-6 md:hidden">
                        {lines.map((item, index) => (
                          <Card key={item.lineId} className="bg-muted/20">
                            <CardContent>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-bold">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.sku}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <VarianceBadge variance={item.variance} />
                                  {canEditLines ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      disabled={isPending}
                                      onClick={() =>
                                        void handleDeleteLine(item)
                                      }
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
                                  <p className="text-muted-foreground">
                                    {FORM_VI.quantity}
                                  </p>
                                  {canEditLines ? (
                                    <FormattedNumberInput
                                      value={String(item.qty)}
                                      onValueChange={(value) =>
                                        patchLine(index, {
                                          qty: Number(value || 0),
                                        })
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
                                  <p className="text-muted-foreground">
                                    {FORM_VI.unitPrice}
                                  </p>
                                  {canEditLines ? (
                                    <FormattedNumberInput
                                      value={
                                        item.price != null
                                          ? String(item.price)
                                          : ""
                                      }
                                      onValueChange={(value) =>
                                        patchLine(index, {
                                          price: value ? Number(value) : null,
                                        })
                                      }
                                      maxFractionDigits={0}
                                      className="h-9"
                                    />
                                  ) : (
                                    <p className="font-semibold">
                                      {item.price != null
                                        ? inventoryCommon.currencyCompact(
                                            formatVND(item.price),
                                          )
                                        : inventoryCommon.noValue}
                                    </p>
                                  )}
                                </div>
                                {canEditLines ? (
                                  <div className="col-span-2">
                                    <p className="text-muted-foreground">
                                      {FORM_VI.unit}
                                    </p>
                                    <Input
                                      value={item.unit}
                                      readOnly
                                      aria-readonly="true"
                                      className="h-9"
                                    />
                                  </div>
                                ) : null}
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">
                                    {FORM_VI.amount}
                                  </p>
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
                                  onClick={() => handleSaveLine(index)}
                                >
                                  <IconSave className="size-4" />
                                  {poDetailCopy.saveLine}
                                </Button>
                              ) : null}
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      <div className="hidden md:block">
                        <Table density="spacious">
                          <TableHeader>
                            <TableRow className="bg-muted/40">
                              {[
                                { label: poDetailCopy.item, align: "" },
                                {
                                  label: FORM_VI.quantity,
                                  align: "text-right",
                                },
                                {
                                  label: FORM_VI.unitPrice,
                                  align: "text-right",
                                },
                                { label: FORM_VI.amount, align: "text-right" },
                                {
                                  label: poDetailCopy.priceVariance,
                                  align: "text-right",
                                },
                                { label: "", align: "text-right" },
                              ].map((h) => (
                                <TableHead
                                  key={h.label}
                                  variant="eyebrow"
                                  className={h.align}
                                >
                                  {h.label}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {lines.map((item, index) => (
                              <TableRow
                                key={item.lineId}
                                className="group transition-colors"
                              >
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-bold">
                                      {item.name}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                      {item.sku}
                                    </span>
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
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  {canEditLines ? (
                                    <FormattedNumberInput
                                      value={String(item.qty)}
                                      onValueChange={(value) =>
                                        patchLine(index, {
                                          qty: Number(value || 0),
                                        })
                                      }
                                      maxFractionDigits={3}
                                      className="h-8 text-right"
                                    />
                                  ) : (
                                    item.qty
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums">
                                  {canEditLines ? (
                                    <FormattedNumberInput
                                      value={
                                        item.price != null
                                          ? String(item.price)
                                          : ""
                                      }
                                      onValueChange={(value) =>
                                        patchLine(index, {
                                          price: value ? Number(value) : null,
                                        })
                                      }
                                      maxFractionDigits={0}
                                      className="h-8 text-right"
                                    />
                                  ) : item.price != null ? (
                                    inventoryCommon.currencyCompact(
                                      formatVND(item.price),
                                    )
                                  ) : (
                                    inventoryCommon.noValue
                                  )}
                                </TableCell>
                                <TableCell className="text-right font-mono tabular-nums font-semibold">
                                  {inventoryCommon.currencyCompact(
                                    formatVND(computePoLineTotal(item)),
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  <VarianceBadge variance={item.variance} />
                                </TableCell>
                                <TableCell className="text-right">
                                  {canEditLines ? (
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
                                        onClick={() =>
                                          void handleDeleteLine(item)
                                        }
                                        className="text-muted-foreground hover:text-destructive"
                                        aria-label={poDetailCopy.deleteLineAria}
                                      >
                                        <IconTrash className="size-4" />
                                      </Button>
                                    </div>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow className="border-border">
                              <TableCell
                                colSpan={3}
                                className="text-right text-sm text-muted-foreground"
                              >
                                {poDetailCopy.goodsTotal}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-semibold">
                                {inventoryCommon.currencyCompact(
                                  formatVND(totalAmount),
                                )}
                              </TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                            <TableRow className="border-border">
                              <TableCell
                                colSpan={3}
                                className="text-right text-sm text-muted-foreground"
                              >
                                {FORM_VI.tax}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums">
                                {inventoryCommon.currencyCompact(
                                  formatVND(taxAmount),
                                )}
                              </TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                            <TableRow className="border-border">
                              <TableCell
                                colSpan={3}
                                className="text-right text-sm font-bold"
                              >
                                {FORM_VI.totalAmount}
                              </TableCell>
                              <TableCell className="text-right font-mono tabular-nums font-bold text-primary">
                                {inventoryCommon.currencyCompact(
                                  formatVND(grandTotal),
                                )}
                              </TableCell>
                              <TableCell colSpan={2} />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>

                      {canEditLines ? (
                        <div className="space-y-3 border-t bg-muted/5 p-4">
                          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                            <div className="space-y-2">
                              <MultiSelectCombobox
                                options={activeIngredients.map(
                                  (ingredient) => ({
                                    value: String(ingredient.id),
                                    label: ingredient.name,
                                    hint: getPoIngredientUnit(ingredient),
                                    alreadySelected: lines.some(
                                      (line) =>
                                        line.ingredientId === ingredient.id,
                                    ),
                                    keywords: [
                                      ingredient.sku ?? "",
                                      ingredient.category ?? "",
                                    ],
                                  }),
                                )}
                                onConfirm={handleBulkAddIngredients}
                                triggerLabel={
                                  messages.inventory.common.bulk
                                    .chooseManyIngredients
                                }
                                confirmLabel={
                                  messages.inventory.common.bulk.addIngredients
                                }
                                searchPlaceholder={
                                  messages.inventory.common.bulk
                                    .searchItemsByNameOrSku
                                }
                                triggerClassName="w-full border-dashed"
                                disabled={isPending}
                              />
                              <p className="text-xs text-muted-foreground">
                                {poCopy.bulkUnitPriceHint}
                              </p>
                            </div>
                            <div className="space-y-2">
                              <Textarea
                                value={bulkPasteText}
                                onChange={(event) =>
                                  setBulkPasteText(event.target.value)
                                }
                                rows={3}
                                placeholder={
                                  messages.inventory.common.bulk
                                    .pastePlaceholder
                                }
                                disabled={isPending}
                              />
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">
                                  {poCopy.bulkDescription}
                                </p>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleBulkPaste}
                                  disabled={isPending || !bulkPasteText.trim()}
                                >
                                  {messages.inventory.common.bulk.applyList}
                                </Button>
                              </div>
                              {bulkIssues.length > 0 ? (
                                <div className="space-y-1 text-xs text-warning-foreground">
                                  <p>
                                    {messages.inventory.common.bulk.rowsNeedReview(
                                      bulkIssues.length,
                                    )}
                                  </p>
                                  {bulkIssues.slice(0, 3).map((issue) => (
                                    <p key={issue}>{issue}</p>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

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

                  <div className="space-y-4">
                    <AppSection
                      title={poDetailCopy.summaryTitle}
                      contentClassName="space-y-3 text-sm"
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
                        <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
                          {inventoryCommon.currencyCompact(
                            formatVND(grandTotal),
                          )}
                        </p>
                      </div>
                    </AppSection>

                    <AppSection title={poDetailCopy.supplierInfoTitle}>
                      {supplierInfoAvailable ? (
                        <div className="space-y-3 text-sm">
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
                      size="touch"
                      disabled={isPending || !canCancelPo}
                      className="rounded-full px-6 text-destructive"
                      onClick={handleCancelPo}
                    >
                      <IconCircleX className="size-5" />
                      {poDetailCopy.cancelPo}
                    </Button>
                  }
                  trailing={
                    <Button
                      type="button"
                      size="touch"
                      disabled={isPending || (!canSendPo && !canCreateGrn)}
                      className="rounded-full px-10 shadow-lg"
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

            <TabsContent value="history" className="mt-4">
              <AuditHistoryList logs={auditLogs} />
            </TabsContent>
          </AppPageTabs>
        }
      />
    </AppPage>
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

  return (
    <AppSection
      title={poDetailCopy.overviewLinesTitle}
      headerHint={
        hasMore
          ? poDetailCopy.overviewLinesPreviewHint(PO_PREVIEW_LIMIT)
          : undefined
      }
      contentClassName="p-0"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{FORM_VI.name}</TableHead>
            <TableHead className="text-right">{FORM_VI.quantity}</TableHead>
            <TableHead className="text-right">{FORM_VI.unitPrice}</TableHead>
            <TableHead className="text-right">{FORM_VI.amount}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.map((line) => (
            <TableRow key={line.lineId}>
              <TableCell>
                <div className="font-medium">{line.name}</div>
                {line.sku ? (
                  <div className="font-mono text-xs text-muted-foreground">
                    {line.sku}
                  </div>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {line.qty} {line.unit}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {line.price != null
                  ? inventoryCommon.currencyCompact(formatVND(line.price))
                  : inventoryCommon.noValue}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums font-semibold">
                {inventoryCommon.currencyCompact(formatVND(line.total))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
