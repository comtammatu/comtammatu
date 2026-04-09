"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  createPurchaseOrder,
  upsertPurchaseOrderLine,
} from "../../procurement-actions";
import type { SupplierRow } from "../../suppliers/suppliers-client";
import type { IngredientRow } from "../../page";

interface LocalLine {
  ingredientId: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitPriceEst: number | null;
}

export function NewPoClient({
  suppliers,
  ingredients,
}: {
  suppliers: SupplierRow[];
  ingredients: IngredientRow[];
}) {
  const router = useRouter();

  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LocalLine[]>([]);
  const [ingredientId, setIngredientId] = useState("");
  const [unit, setUnit] = useState("");
  const [isPending, startTransition] = useTransition();

  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    const ing = ingredients.find((x) => String(x.id) === val);
    if (ing) setUnit(ing.unit);
    // Focus qty after selecting ingredient
    setTimeout(() => qtyRef.current?.focus(), 0);
  }

  function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const iid = Number(ingredientId);
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const resolvedUnit = String(fd.get("unit") ?? ing?.unit ?? "");
    const qty = Number(fd.get("qty"));
    const priceRaw = String(fd.get("unitPriceEst") ?? "").trim();
    const unitPriceEst = priceRaw === "" ? null : Number(priceRaw);
    if (!resolvedUnit || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Nhập số lượng hợp lệ");
      return;
    }
    if (lines.some((l) => l.ingredientId === iid)) {
      toast.error("Nguyên liệu đã có trong danh sách");
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        ingredientId: iid,
        ingredientName: ing?.name ?? `#${iid}`,
        quantity: qty,
        unit: resolvedUnit,
        unitPriceEst,
      },
    ]);
    // Reset add-row
    setIngredientId("");
    setUnit("");
    if (qtyRef.current) qtyRef.current.value = "";
    if (priceRef.current) priceRef.current.value = "";
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function submit() {
    if (!supplierId) {
      toast.error("Chọn nhà cung cấp");
      return;
    }
    startTransition(async () => {
      const poRes = await createPurchaseOrder({
        supplierId: Number(supplierId),
        notes: notes || undefined,
      });
      if (!poRes.success || !poRes.data) {
        toast.error(poRes.error ?? "Không tạo được PO");
        return;
      }
      const poId = (poRes.data as { id: number }).id;
      for (const line of lines) {
        const lineRes = await upsertPurchaseOrderLine({
          poId,
          ingredientId: line.ingredientId,
          quantity: line.quantity,
          unit: line.unit,
          unitPriceEst: line.unitPriceEst,
        });
        if (!lineRes.success) {
          toast.error(`Lỗi "${line.ingredientName}": ${lineRes.error}`);
          router.push(`/admin/inventory/purchase-orders/${poId}`);
          return;
        }
      }
      toast.success("Đã tạo đơn đặt hàng");
      router.push(`/admin/inventory/purchase-orders/${poId}`);
    });
  }

  const totalValue = lines.reduce(
    (sum, l) =>
      sum + (l.unitPriceEst != null ? l.quantity * l.unitPriceEst : 0),
    0,
  );
  const hasValue = lines.some((l) => l.unitPriceEst != null);

  return (
    <div className="max-w-4xl space-y-5">
      {/* Back + title */}
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1">
          <Link href="/admin/inventory/purchase-orders">← Danh sách PO</Link>
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">Tạo đơn đặt hàng</h1>
      </div>

      {/* PO header — compact single row */}
      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>
              Nhà cung cấp <span className="text-destructive">*</span>
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn nhà cung cấp" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Ghi chú</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú đơn hàng…"
            />
          </div>
        </div>
      </div>

      {/* Line items table with inline add-row */}
      <div className="rounded-lg border overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 border-b bg-muted/30 px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Nguyên liệu
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
            Số lượng
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground pl-2">
            ĐV
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
            Đơn giá (₫)
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">
            Thành tiền
          </span>
          <span />
        </div>

        {/* Existing lines */}
        {lines.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Chưa có nguyên liệu — thêm dòng bên dưới
          </div>
        ) : (
          <div>
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center border-b px-3 py-2.5 hover:bg-muted/20 transition-colors"
              >
                <span className="text-sm font-medium">{l.ingredientName}</span>
                <span className="text-sm font-mono text-right">
                  {l.quantity.toLocaleString("vi-VN")}
                </span>
                <span className="text-sm pl-2 text-muted-foreground">
                  {l.unit}
                </span>
                <span className="text-sm font-mono text-right text-muted-foreground">
                  {l.unitPriceEst != null
                    ? l.unitPriceEst.toLocaleString("vi-VN")
                    : "—"}
                </span>
                <span className="text-sm font-mono text-right">
                  {l.unitPriceEst != null
                    ? (l.quantity * l.unitPriceEst).toLocaleString("vi-VN")
                    : "—"}
                </span>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="size-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    aria-label="Xóa"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}

            {/* Total row */}
            {hasValue && (
              <div className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center border-b px-3 py-2 bg-muted/10">
                <span className="col-span-4 text-xs font-semibold text-right text-muted-foreground uppercase tracking-wider">
                  Tổng dự kiến
                </span>
                <span className="text-sm font-semibold font-mono text-right">
                  {totalValue.toLocaleString("vi-VN")} ₫
                </span>
                <span />
              </div>
            )}
          </div>
        )}

        {/* Add-row form — lives inside the table border */}
        <form
          onSubmit={addLine}
          className="grid grid-cols-[2fr_80px_70px_120px_120px_40px] gap-0 items-center bg-muted/5 border-t px-3 py-2"
        >
          <div className="pr-2">
            <Select value={ingredientId} onValueChange={handleIngredientChange}>
              <SelectTrigger className="h-8 text-sm border-dashed">
                <SelectValue placeholder="+ Chọn nguyên liệu" />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={String(i.id)}>
                    {i.name} ({i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Input
              ref={qtyRef}
              name="qty"
              type="number"
              step="any"
              min="0.001"
              required
              placeholder="SL"
              className="h-8 text-sm text-right"
            />
          </div>
          <div className="pl-2">
            <Input
              name="unit"
              placeholder="ĐV"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              required
              className="h-8 text-sm"
            />
          </div>
          <div className="pl-2">
            <Input
              ref={priceRef}
              name="unitPriceEst"
              type="number"
              step="any"
              min="0"
              placeholder="Giá (tùy chọn)"
              className="h-8 text-sm text-right"
            />
          </div>
          <div className="pl-2 flex justify-end">
            <button
              type="submit"
              disabled={!ingredientId}
              className="size-7 flex items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Thêm dòng"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          {/* Hidden last cell for alignment */}
          <span />
        </form>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" asChild>
          <Link href="/admin/inventory/purchase-orders">Hủy</Link>
        </Button>
        <div className="flex items-center gap-3">
          {lines.length > 0 && (
            <span className="text-sm text-muted-foreground">
              {lines.length} dòng
              {hasValue && ` · ${totalValue.toLocaleString("vi-VN")} ₫`}
            </span>
          )}
          <Button onClick={submit} disabled={isPending || !supplierId}>
            {isPending ? "Đang tạo…" : "Tạo PO"}
          </Button>
        </div>
      </div>
    </div>
  );
}
