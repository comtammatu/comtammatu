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
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { IngredientCombobox } from "../../ingredient-combobox";
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
import { StatusBadge } from "../../_components/shared";

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
  const toName = branchNames[tr.to_branch_id] ?? `#${String(tr.to_branch_id)}`;

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
        {/* Back link */}
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/inventory/transfers">← Danh sách</Link>
        </Button>

        {/* Identity Card Header */}
        <section
          className="relative overflow-hidden rounded-2xl ambient-shadow p-6"
          style={{ backgroundColor: "var(--md-surface-lowest)" }}
        >
          <div className="absolute right-6 top-6">
            <StatusBadge
              status={tr.status}
              label={STATUS_LABEL[tr.status] ?? tr.status}
            />
          </div>

          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu luân chuyển
              </p>
              <h1
                className="text-2xl font-black tracking-tight font-mono"
                style={{ color: "var(--md-primary)" }}
              >
                {tr.transfer_number}
              </h1>
            </div>

            <div
              className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              <span>
                Từ:{" "}
                <strong style={{ color: "var(--md-on-surface)" }}>
                  {fromName}
                </strong>
              </span>
              <span>
                Đến:{" "}
                <strong style={{ color: "var(--md-on-surface)" }}>
                  {toName}
                </strong>
              </span>
              {tr.vehicle_info && <span>Xe: {tr.vehicle_info}</span>}
              {tr.shipped_at && (
                <span>
                  Ngày xuất:{" "}
                  {new Date(tr.shipped_at).toLocaleDateString("vi-VN")}
                </span>
              )}
              {tr.receive_started_at && (
                <span>
                  Kiểm nhận:{" "}
                  {new Date(tr.receive_started_at).toLocaleString("vi-VN")}
                </span>
              )}
            </div>

            {tr.notes && (
              <p
                className="text-sm italic"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {tr.notes}
              </p>
            )}
          </div>

          {/* Action buttons bar */}
          <div
            className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 15%, transparent)",
            }}
          >
            {isDraft && (
              <button
                type="button"
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
                onClick={() => setShipConfirmOpen(true)}
                disabled={isPending || lines.length === 0}
              >
                {shipFromIsHq ? "Xác nhận xuất (TS)" : "Xác nhận xuất (CN gửi)"}
              </button>
            )}
            {isShipped && (
              <button
                type="button"
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
                onClick={transit}
                disabled={isPending}
              >
                {isPending ? "..." : "Đang vận chuyển"}
              </button>
            )}
            {isTransit && (
              <button
                type="button"
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
                onClick={confirmReceiveStart}
                disabled={isPending}
              >
                {isPending ? "..." : "Bắt đầu kiểm nhận"}
              </button>
            )}
            {isConfirmedReceive && (
              <button
                type="button"
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
                onClick={receiveFull}
                disabled={isPending}
              >
                {isPending
                  ? "..."
                  : receiveToIsHq
                    ? "Xác nhận nhập Trụ sở"
                    : "Xác nhận nhập chi nhánh"}
              </button>
            )}
            <button
              type="button"
              className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all"
              style={{
                backgroundColor: "var(--md-surface-high)",
                color: "var(--md-on-surface-variant)",
              }}
              onClick={() => window.print()}
              disabled={lines.length === 0}
              aria-label="In phiếu"
            >
              <Printer className="size-4" />
              In phiếu
            </button>
          </div>
        </section>

        {/* Line items — mobile cards / desktop table */}
        {isMobile ? (
          <div
            className="overflow-hidden rounded-2xl ambient-shadow divide-y"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
            }}
          >
            {lines.length === 0 ? (
              <div
                className="py-8 text-center text-sm"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {isDraft
                  ? "Thêm dòng chi tiết trước khi xác nhận xuất."
                  : "Không có dòng."}
              </div>
            ) : (
              lines.map((l) => (
                <div
                  key={l.id}
                  className="p-3 space-y-1"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-medium text-sm truncate"
                      style={{ color: "var(--md-on-surface)" }}
                    >
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    </span>
                    <span className="font-mono text-sm tabular-nums shrink-0">
                      {l.quantity.toLocaleString("vi-VN")} {l.unit}
                    </span>
                  </div>
                  <div
                    className="flex items-center justify-between gap-2 text-xs"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
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
          <section
            className="overflow-hidden rounded-3xl ambient-shadow print:border-none"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
            }}
          >
            <Table>
              <TableHeader>
                <TableRow
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                  }}
                >
                  <TableHead
                    className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--md-outline)" }}
                  >
                    Nguyên liệu
                  </TableHead>
                  <TableHead
                    className="px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--md-outline)" }}
                  >
                    SL gửi
                  </TableHead>
                  <TableHead
                    className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--md-outline)" }}
                  >
                    Đơn vị
                  </TableHead>
                  <TableHead
                    className="hidden sm:table-cell px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--md-outline)" }}
                  >
                    Giá xuất
                  </TableHead>
                  <TableHead
                    className="hidden sm:table-cell px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                    style={{ color: "var(--md-outline)" }}
                  >
                    SL nhận
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-8 text-center"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {isDraft
                        ? "Thêm dòng chi tiết trước khi xác nhận xuất."
                        : "Không có dòng."}
                    </TableCell>
                  </TableRow>
                )}
                {lines.map((l) => (
                  <TableRow
                    key={l.id}
                    className="group transition-colors"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-4 font-medium">
                      {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                      {l.quantity.toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="px-6 py-4">{l.unit}</TableCell>
                    <TableCell
                      className="hidden sm:table-cell px-6 py-4 text-right font-mono tabular-nums"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {l.unit_cost_at_ship != null
                        ? `${l.unit_cost_at_ship.toLocaleString("vi-VN")} ₫`
                        : "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell px-6 py-4 text-right font-mono tabular-nums">
                      {l.quantity_received != null
                        ? l.quantity_received.toLocaleString("vi-VN")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        {/* Add line — inline ingredient picker (draft only) */}
        {isDraft && (
          <section
            className="overflow-hidden rounded-2xl ambient-shadow max-w-xl"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
            }}
          >
            <div
              className="border-b px-6 py-4"
              style={{
                borderColor:
                  "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <h2
                className="text-sm font-bold"
                style={{ color: "var(--md-on-surface)" }}
              >
                Thêm dòng
              </h2>
            </div>
            <form onSubmit={addLine} className="p-6 space-y-4">
              <input type="hidden" name="ingredientId" value={ingredientId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nguyên liệu</Label>
                  <IngredientCombobox
                    ingredients={ingredients.filter((x) => x.is_active)}
                    value={ingredientId}
                    onValueChange={setIngredientId}
                  />
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
              <button
                type="submit"
                className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all hover:scale-[0.98] disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
                disabled={isPending || !ingredientId}
              >
                {isPending ? "Đang lưu..." : "Lưu dòng"}
              </button>
            </form>
          </section>
        )}
      </div>

      {/* Ship confirmation dialog */}
      <AlertDialog open={shipConfirmOpen} onOpenChange={setShipConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xuất kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Xuất <strong>{lines.length} nguyên liệu</strong> từ kho{" "}
              <strong>{fromName}</strong> đến <strong>{toName}</strong>. Sau khi
              xác nhận, tồn kho gửi sẽ bị trừ.
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
