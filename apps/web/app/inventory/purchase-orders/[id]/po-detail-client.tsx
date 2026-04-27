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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Combobox } from "@/components/form";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { InventoryHeader } from "../../_components/inventory-header";
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

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
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
}: {
  po: PODetail;
  ingredients: IngredientRow[];
  isOwner?: boolean;
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
      toast.error("Nháº­p sá»‘ lÆ°á»£ng vÃ  Ä‘Æ¡n vá»‹ há»£p lá»‡.");
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
        toast.error(res.error ?? "KhÃ´ng thá»ƒ lÆ°u dÃ²ng PO.");
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
      toast.success("ÄÃ£ lÆ°u dÃ²ng PO.");
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
      toast.error("Chá»n nguyÃªn liá»‡u.");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0 || !addUnit.trim()) {
      toast.error("Nháº­p sá»‘ lÆ°á»£ng vÃ  Ä‘Æ¡n vá»‹ há»£p lá»‡.");
      return;
    }
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      toast.error("ÄÆ¡n giÃ¡ khÃ´ng há»£p lá»‡.");
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
        toast.error(res.error ?? "KhÃ´ng thá»ƒ thÃªm dÃ²ng PO.");
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
      toast.success("ÄÃ£ lÆ°u dÃ²ng PO.");
      router.refresh();
    });
  }

  async function handleDeleteLine(line: EditablePoLine) {
    const ok = await confirm({
      title: "XÃ³a dÃ²ng PO?",
      description: line.name,
      variant: "destructive",
      confirmText: "XÃ³a dÃ²ng",
    });
    if (!ok) return;

    startTransition(async () => {
      const res = await deletePurchaseOrderLine({
        poId: po.id,
        lineId: line.lineId,
      });
      if (!res.success) {
        toast.error(res.error ?? "KhÃ´ng thá»ƒ xÃ³a dÃ²ng PO.");
        return;
      }
      setLines((current) =>
        current.filter((item) => item.lineId !== line.lineId),
      );
      toast.success("ÄÃ£ xÃ³a dÃ²ng PO.");
      router.refresh();
    });
  }

  function handleSendPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "sent");
      if (!res.success) {
        toast.error(res.error ?? "Không thể gửi PO.");
        return;
      }
      toast.success("Đã gửi PO cho nhà cung cấp.");
      router.refresh();
    });
  }

  function handleCancelPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(po.id, "cancelled");
      if (!res.success) {
        toast.error(res.error ?? "Không thể hủy PO.");
        return;
      }
      toast.success("Đã hủy PO.");
      router.refresh();
    });
  }

  function handleCreateGrn() {
    startTransition(async () => {
      const res = await createGrnFromPo(po.id);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo GRN từ PO.");
        return;
      }

      const created = res.data as { id: number };
      toast.success("Đã tạo GRN từ PO.");
      router.push(`/inventory/grn/${created.id}`);
    });
  }

  return (
    <>
      <InventoryHeader
        title="Chi tiết đơn hàng"
        actions={
          <Link
            href="/inventory/purchase-orders"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {tRoute("/inventory/purchase-orders", "heading")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Nhập hàng HQ
              </p>
              <div className="space-y-1">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {po.code}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {`${po.supplier} • ${po.date} • Gửi NCC ${po.sentAt} • Bước mở đầu của hub procurement`}
                </p>
              </div>
            </div>
            <Badge variant={getInventoryStatusBadgeVariant(po.status)}>
              {getInventoryStatusLabel(po.status)}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardContent>
                <Badge variant="secondary">Nhà cung cấp</Badge>
                <p className="mt-3 text-xl font-semibold">{po.supplier}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Badge variant="secondary">Tổng tiền hàng</Badge>
                <p className="mt-3 text-xl font-semibold">
                  {formatVND(totalAmount)} VNĐ
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Badge variant="secondary">{FORM_VI.totalAmount}</Badge>
                <p className="mt-3 text-2xl font-semibold text-primary">
                  {formatVND(grandTotal)}{" "}
                  <span className="text-xs font-normal">VNĐ</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="py-6">
              <div className="flex justify-center">
                <TimelineStepper
                  steps={[
                    { label: "Nháp", date: po.date, completed: true },
                    {
                      label: "Đã gửi",
                      date: po.sentAt,
                      completed: po.status !== "draft",
                    },
                    { label: "Chờ kiểm nhận", active: po.status === "sent" },
                    { label: "Đã có GRN" },
                  ]}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader className="gap-1">
                  <CardTitle>Danh mục đặt mua</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {`${lines.length} mặt hàng trong đơn mua này trước khi chuyển sang bước GRN.`}
                  </p>
                </CardHeader>
                <CardContent className="p-0">
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
                                  onClick={() => void handleDeleteLine(item)}
                                  className="text-muted-foreground hover:text-destructive"
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
                              <p className="text-muted-foreground">{FORM_VI.unitPrice}</p>
                              {canEditLines ? (
                                <FormattedNumberInput
                                  value={
                                    item.price != null ? String(item.price) : ""
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
                                    ? `${formatVND(item.price)}đ`
                                    : "—"}
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
                              <p className="text-muted-foreground">
                                {FORM_VI.amount}
                              </p>
                              <p className="font-semibold text-primary">
                                {formatVND(computePoLineTotal(item))}đ
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
                              Lưu dòng
                            </Button>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          {[
                            { label: "Mặt hàng", align: "" },
                            { label: "Số lượng", align: "text-right" },
                            { label: "Đơn giá", align: "text-right" },
                            { label: "Thành tiền", align: "text-right" },
                            { label: "Biến động giá", align: "text-right" },
                            { label: "", align: "text-right" },
                          ].map((h) => (
                            <TableHead
                              key={h.label}
                              className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h.align}`}
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
                            <TableCell className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="font-bold">{item.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {item.sku}
                                </span>
                                {canEditLines ? (
                                  <Input
                                    value={item.unit}
                                    readOnly
                                    aria-readonly="true"
                                    className="mt-2 h-8 max-w-24"
                                    aria-label="Đơn vị"
                                  />
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
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
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                              {canEditLines ? (
                                <FormattedNumberInput
                                  value={
                                    item.price != null ? String(item.price) : ""
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
                                `${formatVND(item.price)}đ`
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                              {formatVND(computePoLineTotal(item))}đ
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              <VarianceBadge variance={item.variance} />
                            </TableCell>
                            <TableCell className="px-6 py-4 text-right">
                              {canEditLines ? (
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    disabled={isPending || !item.dirty}
                                    onClick={() => handleSaveLine(index)}
                                    aria-label="Lưu dòng"
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
                                    aria-label="Xóa dòng"
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
                            className="px-6 py-3 text-right text-sm text-muted-foreground"
                          >
                            Tổng tiền hàng
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-semibold">
                            {formatVND(totalAmount)}đ
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                        <TableRow className="border-border">
                          <TableCell
                            colSpan={3}
                            className="px-6 py-3 text-right text-sm text-muted-foreground"
                          >
                            Thuế (VAT 8%)
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums">
                            {formatVND(taxAmount)}đ
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                        <TableRow className="border-border">
                          <TableCell
                            colSpan={3}
                            className="px-6 py-3 text-right text-sm font-bold"
                          >
                            {FORM_VI.totalAmount}
                          </TableCell>
                          <TableCell className="px-6 py-3 text-right font-mono tabular-nums font-bold text-primary">
                            {formatVND(grandTotal)}đ
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>

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
                            hint: ingredient.purchase_unit ?? ingredient.unit,
                            keywords: [
                              ingredient.sku ?? "",
                              ingredient.category ?? "",
                            ],
                          }))}
                        placeholder="+ Chọn nguyên liệu"
                        searchPlaceholder="Tìm tên, SKU, danh mục..."
                        triggerClassName="h-9 border-dashed"
                      />
                      <FormattedNumberInput
                        value={addQty}
                        onValueChange={setAddQty}
                        maxFractionDigits={3}
                        placeholder="SL"
                        className="h-9"
                        required
                      />
                      <Input
                        value={addUnit}
                        readOnly
                        aria-readonly="true"
                        placeholder="ĐV"
                        className="h-9"
                        required
                      />
                      <FormattedNumberInput
                        value={addPrice}
                        onValueChange={setAddPrice}
                        maxFractionDigits={0}
                        placeholder="Giá"
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
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Tóm tắt đơn mua</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Số mặt hàng</span>
                    <span className="font-semibold">{lines.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">
                      Tổng tiền hàng
                    </span>
                    <span className="font-semibold">
                      {formatVND(totalAmount)}đ
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{FORM_VI.tax}</span>
                    <span className="font-semibold">
                      {formatVND(taxAmount)}đ
                    </span>
                  </div>
                  <div className="border-t border-border pt-3">
                    <p className="text-muted-foreground">{FORM_VI.totalAmount}</p>
                    <p className="mt-1 text-2xl font-black text-primary">
                      {formatVND(grandTotal)}đ
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Thông tin NCC</CardTitle>
                </CardHeader>
                <CardContent>
                  {supplierInfoAvailable ? (
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Địa chỉ xuất hóa đơn
                        </p>
                        <p className="mt-1 break-words font-medium">
                          {po.supplierInfo.address}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Người liên hệ
                        </p>
                        <p className="mt-1 font-medium">
                          {po.supplierInfo.contact}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Hạn thanh toán
                        </p>
                        <p className="mt-1 font-medium">
                          {po.supplierInfo.payment}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      Chưa có thêm thông tin nhà cung cấp trong đơn mua này.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>

          <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              disabled={isPending || !canCancelPo}
              className="min-h-11 rounded-full px-6 font-bold text-destructive"
              onClick={handleCancelPo}
            >
              <IconCircleX className="size-5" />
              Hủy PO
            </Button>
            <Button
              type="button"
              disabled={isPending || (!canSendPo && !canCreateGrn)}
              className="min-h-11 rounded-full px-10 font-bold shadow-lg"
              onClick={canSendPo ? handleSendPo : handleCreateGrn}
            >
              <IconCircleCheck className="size-5" />
              {canSendPo ? "Gửi PO cho NCC" : "Sang bước tạo GRN"}
            </Button>
          </footer>
        </div>
      </div>
    </>
  );
}
