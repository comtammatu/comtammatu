"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  confirmGrn,
  fetchGrnDetail,
  upsertGrnLine,
} from "../../procurement-actions";
import type { IngredientRow } from "../../page";

interface GrnRecord {
  id: number;
  grn_number: string;
  status: string;
  received_date: string;
  notes: string | null;
}

interface LineRow {
  id: number;
  ingredient_id: number;
  received_quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  quality_status: string;
  ingredients: { id: number; name: string; unit: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed: "Đã nhập kho",
  cancelled: "Đã hủy",
};

export function GrnDetailClient({
  grnId,
  initialGrn,
  initialLines,
  ingredients,
}: {
  grnId: number;
  initialGrn: GrnRecord;
  initialLines: LineRow[];
  ingredients: IngredientRow[];
}) {
  const router = useRouter();
  const [grn, setGrn] = useState(initialGrn);
  const [lines, setLines] = useState(initialLines);
  const [ingredientId, setIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDraft = grn.status === "draft";

  async function reload() {
    const res = await fetchGrnDetail(grnId);
    if (!res.success || !res.data) {
      toast.error("Không tải lại được");
      return;
    }
    const d = res.data as { grn: GrnRecord; lines: LineRow[] };
    setGrn(d.grn);
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
    const unitCost = Number(fd.get("unitCost"));
    if (
      !unit ||
      !Number.isFinite(qty) ||
      qty <= 0 ||
      !Number.isFinite(unitCost) ||
      unitCost < 0
    ) {
      toast.error("Kiểm tra SL, đơn vị và đơn giá");
      return;
    }
    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId,
        ingredientId: iid,
        receivedQuantity: qty,
        unit,
        unitCost,
        qualityStatus: "accepted",
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

  function doConfirm() {
    startTransition(async () => {
      const res = await confirmGrn(grnId);
      if (!res.success) {
        toast.error(res.error ?? "Không xác nhận được");
        return;
      }
      toast.success("Đã nhập kho và cập nhật WAC");
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/admin/inventory/grn">← Danh sách GRN</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {grn.grn_number}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(grn.received_date).toLocaleString("vi-VN")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{STATUS_LABEL[grn.status] ?? grn.status}</Badge>
          </div>
          {grn.notes && (
            <p className="mt-2 text-sm text-muted-foreground">{grn.notes}</p>
          )}
        </div>
        {isDraft && (
          <Button
            type="button"
            onClick={doConfirm}
            disabled={isPending || lines.length === 0}
          >
            {isPending ? "Đang xử lý…" : "Xác nhận nhập kho"}
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguyên liệu</TableHead>
              <TableHead className="text-right">SL</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="text-right">Đơn giá</TableHead>
              <TableHead className="text-right">Thành tiền</TableHead>
              <TableHead className="hidden sm:table-cell">QC</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {isDraft
                    ? "Thêm ít nhất một dòng trước khi xác nhận."
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
                  {l.received_quantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell>{l.unit}</TableCell>
                <TableCell className="text-right font-mono">
                  {l.unit_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell className="text-right font-mono">
                  {l.total_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                  {l.quality_status}
                </TableCell>
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
          <h2 className="font-semibold text-sm">Thêm / cập nhật dòng</h2>
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
              <Label htmlFor="qty">Số lượng nhận</Label>
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
              <Label htmlFor="unitCost">Đơn giá (₫)</Label>
              <Input
                id="unitCost"
                name="unitCost"
                type="number"
                step="any"
                min="0"
                required
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
