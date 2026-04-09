"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  fetchStockTransferDetail,
  transferConfirmReceive,
  transferConfirmShip,
  transferMarkInTransit,
  transferReceive,
  upsertTransferLine,
} from "../../transfer-actions";
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
  branchNames,
}: {
  transferId: number;
  initialTransfer: TransferRecord;
  initialLines: TLineRow[];
  ingredients: IngredientRow[];
  hqBranchId: number | null;
  branchNames: Record<number, string>;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [tr, setTr] = useState(initialTransfer);
  const [lines, setLines] = useState(initialLines);
  const [ingredientId, setIngredientId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [shipConfirmOpen, setShipConfirmOpen] = useState(false);

  const shipFromIsHq = hqBranchId != null && tr.from_branch_id === hqBranchId;
  const receiveToIsHq = hqBranchId != null && tr.to_branch_id === hqBranchId;
  const selectedIngredient = ingredients.find(
    (x) => String(x.id) === ingredientId,
  );

  const fromName =
    branchNames[tr.from_branch_id] ?? `#${String(tr.from_branch_id)}`;
  const toName =
    branchNames[tr.to_branch_id] ?? `#${String(tr.to_branch_id)}`;

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

  function doShip() {
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
    <div>
      <div className="space-y-6 print:hidden">
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
                onClick={() => setShipConfirmOpen(true)}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
              disabled={lines.length === 0}
              aria-label="In phiếu"
            >
              <Printer className="mr-1.5 size-4" />
              In phiếu
            </Button>
          </div>
        </div>

        {/* Line items — mobile cards / desktop table */}
        {isMobile ? (
          <div className="rounded-md border divide-y">
            {lines.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {isDraft
                  ? "Thêm dòng chi tiết trước khi xác nhận xuất."
                  : "Không có dòng."}
              </div>
            ) : (
              lines.map((l) => (
                <div key={l.id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    </span>
                    <span className="font-mono text-sm tabular-nums shrink-0">
                      {l.quantity.toLocaleString("vi-VN")} {l.unit}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {l.unit_cost_at_ship != null
                        ? `Giá: ${l.unit_cost_at_ship.toLocaleString("vi-VN")} ₫`
                        : "—"}
                    </span>
                    <span>
                      {l.quantity_received != null
                        ? `Nhận: ${l.quantity_received.toLocaleString("vi-VN")}`
                        : ""}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="rounded-md border print:border-none">
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
        )}

        {/* Add line — inline ingredient picker (draft only) */}
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
                <Select value={ingredientId} onValueChange={setIngredientId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nguyên liệu…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients
                      .filter((x) => x.is_active)
                      .map((i) => (
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
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !ingredientId}
            >
              {isPending ? "Đang lưu…" : "Lưu dòng"}
            </Button>
          </form>
        )}
      </div>

      {/* Ship confirmation dialog */}
      <AlertDialog open={shipConfirmOpen} onOpenChange={setShipConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xuất kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Xuất <strong>{lines.length} nguyên liệu</strong> từ kho{" "}
              <strong>{fromName}</strong> đến <strong>{toName}</strong>.
              Sau khi xác nhận, tồn kho gửi sẽ bị trừ.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShipConfirmOpen(false);
                doShip();
              }}
              disabled={isPending}
            >
              {isPending ? "Đang xử lý…" : "Xác nhận xuất"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Print-only template */}
      <div
        aria-hidden="true"
        className="hidden print:block print:absolute print:inset-0 print:z-50 print:bg-white print:p-8 print:text-black [print&]:text-xs"
      >
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-xl font-bold">PHIẾU LUÂN CHUYỂN KHO</h1>
            <p className="mt-1 font-mono text-lg">{tr.transfer_number}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p>
                <strong>Kho xuất:</strong> {fromName}
              </p>
              <p>
                <strong>Kho nhận:</strong> {toName}
              </p>
            </div>
            <div className="text-right">
              <p>
                <strong>Trạng thái:</strong>{" "}
                {STATUS_LABEL[tr.status] ?? tr.status}
              </p>
              <p>
                <strong>Ngày xuất:</strong>{" "}
                {tr.shipped_at
                  ? new Date(tr.shipped_at).toLocaleDateString("vi-VN")
                  : "—"}
              </p>
              {tr.vehicle_info && (
                <p>
                  <strong>Xe:</strong> {tr.vehicle_info}
                </p>
              )}
            </div>
          </div>

          {tr.notes && (
            <p className="text-sm">
              <strong>Ghi chú:</strong> {tr.notes}
            </p>
          )}

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="py-1 text-left">STT</th>
                <th className="py-1 text-left">Nguyên liệu</th>
                <th className="py-1 text-right">Số lượng</th>
                <th className="py-1 text-left pl-4">Đơn vị</th>
                <th className="py-1 text-right">SL nhận</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, idx) => (
                <tr key={l.id} className="border-b border-gray-300">
                  <td className="py-1">{idx + 1}</td>
                  <td className="py-1">
                    {l.ingredients?.name ?? `#${String(l.ingredient_id)}`}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {l.quantity.toLocaleString("vi-VN")}
                  </td>
                  <td className="py-1 pl-4">{l.unit}</td>
                  <td className="py-1 text-right font-mono">
                    {l.quantity_received != null
                      ? l.quantity_received.toLocaleString("vi-VN")
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-12 grid grid-cols-3 gap-8 text-center text-sm">
            <div>
              <p className="font-semibold">Người giao</p>
              <p className="mt-12 border-t border-gray-400 pt-1">
                (Ký, ghi rõ họ tên)
              </p>
            </div>
            <div>
              <p className="font-semibold">Vận chuyển</p>
              <p className="mt-12 border-t border-gray-400 pt-1">
                (Ký, ghi rõ họ tên)
              </p>
            </div>
            <div>
              <p className="font-semibold">Người nhận</p>
              <p className="mt-12 border-t border-gray-400 pt-1">
                (Ký, ghi rõ họ tên)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
