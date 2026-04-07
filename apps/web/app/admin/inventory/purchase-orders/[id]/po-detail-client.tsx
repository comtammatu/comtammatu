"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  deletePurchaseOrderLine,
  fetchPurchaseOrderDetail,
  upsertPurchaseOrderLine,
} from "../../procurement-actions";
import type { IngredientRow } from "../../page";

export interface PurchaseOrderDetailRecord {
  id: number;
  po_number: string;
  status: string;
  ordered_at: string;
  notes: string | null;
  supplier_id: number;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
}

export interface PoLineRow {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_price_est: number | null;
  line_total: number | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  sent: "Đã gửi",
  partially_received: "Nhận một phần",
  received: "Đã nhận đủ",
  cancelled: "Đã hủy",
};

export function PoDetailClient({
  poId,
  initialPo,
  initialLines,
  ingredients,
}: {
  poId: number;
  initialPo: PurchaseOrderDetailRecord;
  initialLines: PoLineRow[];
  ingredients: IngredientRow[];
}) {
  const router = useRouter();
  const [po, setPo] = useState(initialPo);
  const [lines, setLines] = useState(initialLines);
  const [ingredientId, setIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDraft = po.status === "draft";

  async function reload() {
    const res = await fetchPurchaseOrderDetail(poId);
    if (!res.success || !res.data) {
      toast.error("Không tải lại được");
      return;
    }
    const d = res.data as {
      po: PurchaseOrderDetailRecord;
      lines: PoLineRow[];
    };
    setPo(d.po);
    setLines(d.lines);
    router.refresh();
  }

  function addLine(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const iid = Number(ingredientId || fd.get("ingredientId"));
    if (!iid) {
      toast.error("Chọn nguyên liệu");
      return;
    }
    const ing = ingredients.find((x) => x.id === iid);
    const unit = String(fd.get("unit") ?? ing?.unit ?? "");
    const qty = Number(fd.get("qty"));
    const priceRaw = String(fd.get("unitPriceEst") ?? "").trim();
    const unitPriceEst = priceRaw === "" ? null : Number(priceRaw);
    if (!unit || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Kiểm tra số lượng và đơn vị");
      return;
    }
    if (
      unitPriceEst != null &&
      (!Number.isFinite(unitPriceEst) || unitPriceEst < 0)
    ) {
      toast.error("Đơn giá dự kiến không hợp lệ");
      return;
    }
    startTransition(async () => {
      const res = await upsertPurchaseOrderLine({
        poId,
        ingredientId: iid,
        quantity: qty,
        unit,
        unitPriceEst,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được dòng");
        return;
      }
      toast.success("Đã lưu dòng");
      setIngredientId("");
      await reload();
    });
  }

  function removeLine(lineId: number) {
    startTransition(async () => {
      const res = await deletePurchaseOrderLine({ poId, lineId });
      if (!res.success) {
        toast.error(res.error ?? "Không xóa được");
        return;
      }
      toast.success("Đã xóa dòng");
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/admin/inventory/purchase-orders">← Danh sách PO</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {po.po_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {po.suppliers?.name ?? "—"} ·{" "}
            {new Date(po.ordered_at).toLocaleString("vi-VN")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">
              {STATUS_LABEL[po.status] ?? po.status}
            </Badge>
          </div>
          {po.notes && (
            <p className="mt-2 text-sm text-muted-foreground">{po.notes}</p>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguyên liệu</TableHead>
              <TableHead className="text-right">Số lượng</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Đơn giá dự kiến
              </TableHead>
              <TableHead className="hidden md:table-cell text-right">
                Thành tiền
              </TableHead>
              {isDraft && <TableHead className="w-14" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={isDraft ? 6 : 5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {isDraft
                    ? "Chưa có dòng — thêm nguyên liệu bên dưới."
                    : "Không có dòng chi tiết."}
                </TableCell>
              </TableRow>
            )}
            {lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">
                  {l.ingredients?.name ?? `#${l.ingredient_id}`}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {l.quantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>{l.unit}</TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono text-muted-foreground">
                  {l.unit_price_est != null
                    ? `${l.unit_price_est.toLocaleString("vi-VN")} ₫`
                    : "—"}
                </TableCell>
                <TableCell className="hidden md:table-cell text-right font-mono">
                  {l.line_total != null
                    ? `${l.line_total.toLocaleString("vi-VN")} ₫`
                    : "—"}
                </TableCell>
                {isDraft && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      disabled={isPending}
                      onClick={() => removeLine(l.id)}
                      aria-label="Xóa dòng"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {isDraft && (
        <form
          onSubmit={addLine}
          className="rounded-lg border bg-muted/30 p-4 space-y-3 max-w-xl"
        >
          <h2 className="font-semibold text-sm">Thêm dòng</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nguyên liệu</Label>
              <Select
                value={ingredientId}
                onValueChange={setIngredientId}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn" />
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
            <div className="space-y-1.5">
              <Label htmlFor="qty">Số lượng</Label>
              <Input
                id="qty"
                name="qty"
                type="number"
                step="any"
                min="0"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unit">Đơn vị</Label>
              <Input id="unit" name="unit" required placeholder="kg" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="unitPriceEst">
                Đơn giá dự kiến (₫, tùy chọn)
              </Label>
              <Input
                id="unitPriceEst"
                name="unitPriceEst"
                type="number"
                step="any"
                min="0"
                placeholder="Để trống nếu chưa có"
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={isPending || !ingredientId}>
            {isPending ? "Đang lưu…" : "Lưu dòng"}
          </Button>
        </form>
      )}
    </div>
  );
}
