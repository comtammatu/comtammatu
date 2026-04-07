"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
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
  fetchStockTransferDetail,
  transferConfirmReceive,
  transferConfirmShip,
  transferMarkInTransit,
  transferReceive,
  upsertTransferLine,
} from "../../transfer-actions";
import { IngredientSearchDialog } from "../transfer-ingredient-dialog";
import type { IngredientRow } from "../../page";

interface TransferRecord {
  id: number;
  transfer_number: string;
  status: string;
  notes: string | null;
  vehicle_info: string | null;
  shipped_at: string | null;
  received_at: string | null;
  receive_started_at?: string | null;
  from_branch_id: number;
  to_branch_id: number;
}

interface TLineRow {
  id: number;
  ingredient_id: number;
  quantity: number;
  unit: string;
  unit_cost_at_ship: number | null;
  quantity_received: number | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Nháp",
  confirmed_ship: "Đã xuất kho",
  in_transit: "Đang VC",
  confirmed_receive: "Đang kiểm nhận",
  received: "Đã nhận",
  cancelled: "Đã hủy",
};

export function TransferDetailClient({
  transferId,
  initialTransfer,
  initialLines,
  ingredients,
  hqBranchId,
}: {
  transferId: number;
  initialTransfer: TransferRecord;
  initialLines: TLineRow[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
}) {
  const router = useRouter();
  const [tr, setTr] = useState(initialTransfer);
  const [lines, setLines] = useState(initialLines);
  const [ingredientId, setIngredientId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const shipFromIsHq = hqBranchId != null && tr.from_branch_id === hqBranchId;
  const receiveToIsHq = hqBranchId != null && tr.to_branch_id === hqBranchId;
  const selectedIngredient = ingredients.find(
    (x) => String(x.id) === ingredientId,
  );

  async function reload() {
    const res = await fetchStockTransferDetail(transferId);
    if (!res.success || !res.data) {
      toast.error("Không tải lại được");
      return;
    }
    const d = res.data as { transfer: TransferRecord; lines: TLineRow[] };
    setTr(d.transfer);
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
    if (!unit || !Number.isFinite(qty) || qty <= 0) {
      toast.error("Kiểm tra số lượng và đơn vị");
      return;
    }
    startTransition(async () => {
      const res = await upsertTransferLine({
        transferId,
        ingredientId: iid,
        quantity: qty,
        unit,
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

  function pickIngredient(ing: IngredientRow) {
    setIngredientId(String(ing.id));
  }

  function ship() {
    startTransition(async () => {
      const res = await transferConfirmShip(transferId);
      if (!res.success) {
        toast.error(res.error ?? "Không xác nhận xuất");
        return;
      }
      toast.success(
        shipFromIsHq
          ? "Đã xác nhận xuất tại Trụ sở"
          : "Đã xác nhận xuất tại chi nhánh gửi",
      );
      await reload();
    });
  }

  function transit() {
    startTransition(async () => {
      const res = await transferMarkInTransit(transferId);
      if (!res.success) {
        toast.error(res.error ?? "Không cập nhật được");
        return;
      }
      toast.success("Đã chuyển sang đang vận chuyển");
      await reload();
    });
  }

  function confirmReceiveStart() {
    startTransition(async () => {
      const res = await transferConfirmReceive(transferId);
      if (!res.success) {
        toast.error(res.error ?? "Không cập nhật được");
        return;
      }
      toast.success(
        receiveToIsHq
          ? "Trụ sở bắt đầu kiểm nhận"
          : "Chi nhánh nhận bắt đầu kiểm nhận",
      );
      await reload();
    });
  }

  function receiveFull() {
    startTransition(async () => {
      const res = await transferReceive(transferId, null);
      if (!res.success) {
        toast.error(res.error ?? "Không nhập được kho");
        return;
      }
      toast.success(
        receiveToIsHq
          ? "Trụ sở đã nhập đủ — tồn đã cập nhật"
          : "Chi nhánh đã nhận đủ — tồn đã cập nhật",
      );
      await reload();
    });
  }

  const isDraft = tr.status === "draft";
  const isShipped = tr.status === "confirmed_ship";
  const isTransit = tr.status === "in_transit";
  const isConfirmedReceive = tr.status === "confirmed_receive";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
            <Link href="/admin/inventory/transfers">← Danh sách</Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight font-mono">
            {tr.transfer_number}
          </h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{STATUS_LABEL[tr.status] ?? tr.status}</Badge>
            {tr.vehicle_info && (
              <span className="text-sm text-muted-foreground">
                Xe: {tr.vehicle_info}
              </span>
            )}
          </div>
          {tr.receive_started_at && (
            <p className="mt-2 text-xs text-muted-foreground">
              Bắt đầu kiểm nhận:{" "}
              {new Date(tr.receive_started_at).toLocaleString("vi-VN")}
            </p>
          )}
          {tr.notes && (
            <p className="mt-2 text-sm text-muted-foreground">{tr.notes}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <Button
              type="button"
              onClick={ship}
              disabled={isPending || lines.length === 0}
            >
              {shipFromIsHq ? "Xác nhận xuất (TS)" : "Xác nhận xuất (CN gửi)"}
            </Button>
          )}
          {isShipped && (
            <Button type="button" onClick={transit} disabled={isPending}>
              {isPending ? "…" : "Đang vận chuyển"}
            </Button>
          )}
          {isTransit && (
            <Button
              type="button"
              onClick={confirmReceiveStart}
              disabled={isPending}
            >
              {isPending ? "…" : "Bắt đầu kiểm nhận"}
            </Button>
          )}
          {isConfirmedReceive && (
            <Button type="button" onClick={receiveFull} disabled={isPending}>
              {isPending
                ? "…"
                : receiveToIsHq
                  ? "Xác nhận nhập Trụ sở"
                  : "Xác nhận nhập chi nhánh"}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nguyên liệu</TableHead>
              <TableHead className="text-right">SL gửi</TableHead>
              <TableHead>Đơn vị</TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                Giá xuất
              </TableHead>
              <TableHead className="hidden sm:table-cell text-right">
                SL nhận
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  {isDraft
                    ? "Thêm dòng chi tiết trước khi xác nhận xuất."
                    : "Không có dòng."}
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
                  {l.unit_cost_at_ship != null
                    ? `${l.unit_cost_at_ship.toLocaleString("vi-VN")} ₫`
                    : "—"}
                </TableCell>
                <TableCell className="hidden sm:table-cell text-right font-mono">
                  {l.quantity_received != null
                    ? l.quantity_received.toLocaleString("vi-VN")
                    : "—"}
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
          <h2 className="font-semibold text-sm">Thêm dòng</h2>
          <input type="hidden" name="ingredientId" value={ingredientId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nguyên liệu</Label>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  {ingredientId
                    ? (ingredients.find((x) => String(x.id) === ingredientId)
                        ?.name ?? "Đã chọn")
                    : "Chọn trong bảng nguyên liệu…"}
                </Button>
                {ingredientId && (
                  <span className="text-xs text-muted-foreground">
                    Có thể tìm theo tên, SKU, danh mục trong popup.
                  </span>
                )}
              </div>
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
              <Input
                key={ingredientId || "none"}
                id="unit"
                name="unit"
                required
                placeholder="kg"
                defaultValue={selectedIngredient?.unit ?? ""}
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={isPending || !ingredientId}>
            {isPending ? "Đang lưu…" : "Lưu dòng"}
          </Button>
        </form>
      )}

      <IngredientSearchDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        ingredients={ingredients}
        onPick={pickIngredient}
      />
    </div>
  );
}
