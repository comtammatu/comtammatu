"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  History,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { StatusBadge, TimelineStepper } from "../../_components/shared";
import {
  createGrnFromPo,
  deletePurchaseOrderLine,
  fetchPurchaseOrderDetail,
  fetchPriceDeviations,
  fetchIngredientPriceHistory,
  upsertPurchaseOrderLine,
  updatePurchaseOrderStatus,
} from "../../procurement-actions";
import type {
  LinkedGrnRow,
  PriceDeviationRow,
  PriceHistoryRow,
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
  linkedGrns: initialLinkedGrns,
}: {
  poId: number;
  initialPo: PurchaseOrderDetailRecord;
  initialLines: PoLineRow[];
  ingredients: IngredientRow[];
  linkedGrns: LinkedGrnRow[];
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [po, setPo] = useState(initialPo);
  const [lines, setLines] = useState(initialLines);
  const [linkedGrns, setLinkedGrns] = useState(initialLinkedGrns);
  const [isPending, startTransition] = useTransition();

  // Price intelligence state
  const [deviations, setDeviations] = useState<Map<number, PriceDeviationRow>>(
    new Map(),
  );
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRow[] | null>(
    null,
  );
  const [historyIngredientId, setHistoryIngredientId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const hasAnyPrice = lines.some((l) => l.unit_price_est != null);
    if (!hasAnyPrice) return;
    fetchPriceDeviations({ poId }).then((res) => {
      if (res.success && res.data) {
        const map = new Map<number, PriceDeviationRow>();
        for (const d of res.data as PriceDeviationRow[]) {
          map.set(d.ingredient_id, d);
        }
        setDeviations(map);
      }
    });
  }, [poId, lines]);

  const isDraft = po.status === "draft";

  async function reload() {
    const res = await fetchPurchaseOrderDetail(poId);
    if (!res.success || !res.data) {
      toast.error("Không thể tải lại dữ liệu");
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

  function handleCreateGrn() {
    startTransition(async () => {
      const res = await createGrnFromPo(poId);
      if (!res.success || !res.data) {
        toast.error(res.error ?? "Không thể tạo phiếu nhập");
        return;
      }
      const newId = (res.data as { id: number }).id;
      setLinkedGrns((prev) => [
        {
          id: newId,
          grn_number: `GRN-...`,
          status: "draft",
          received_date: new Date().toISOString(),
        },
        ...prev,
      ]);
      router.push(`/inventory/grn/${newId}`);
    });
  }

  function handleSendPo() {
    startTransition(async () => {
      const res = await updatePurchaseOrderStatus(poId, "sent");
      if (!res.success) {
        toast.error(res.error ?? "Không thể gửi đơn đặt hàng");
        return;
      }
      toast.success("Đã gửi PO");
      await reload();
    });
  }

  const totalValue = lines.reduce((sum, l) => sum + (l.line_total ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/inventory/purchase-orders"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        ← Danh sách PO
      </Link>

      {/* Header Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl ambient-shadow p-8"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge
            status={po.status}
            label={STATUS_LABEL[po.status] ?? po.status}
          />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + Supplier */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã PO
              </p>
              <h1 className="text-3xl font-black tracking-tight font-mono">
                {po.po_number}
              </h1>
            </div>
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Nhà cung cấp
              </p>
              <p className="font-semibold">{po.suppliers?.name ?? "—"}</p>
            </div>
          </div>

          {/* Column 2: Date + Notes */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày tạo
              </p>
              <p className="font-semibold">
                {new Date(po.ordered_at).toLocaleString("vi-VN")}
              </p>
            </div>
            {po.notes && (
              <div>
                <p
                  className="mb-1 text-xs uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Ghi chú
                </p>
                <p
                  className="text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {po.notes}
                </p>
              </div>
            )}
          </div>

          {/* Column 3: Total + Line count */}
          <div
            className="space-y-4 border-l pl-12"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 30%, transparent)",
            }}
          >
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Tổng giá trị
              </p>
              <p
                className="text-2xl font-black tabular-nums"
                style={{ color: "var(--md-primary)" }}
              >
                {totalValue > 0 ? (
                  <>
                    {totalValue.toLocaleString("vi-VN")}{" "}
                    <span className="text-xs font-normal">₫</span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Số dòng
              </p>
              <p className="font-semibold">{lines.length} dòng</p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Stepper */}
      <section
        className="flex justify-center overflow-hidden rounded-2xl py-6 ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <TimelineStepper
          steps={[
            {
              label: "Nháp",
              completed: po.status !== "draft",
              active: po.status === "draft",
            },
            {
              label: "Đã gửi",
              completed:
                po.status === "partially_received" || po.status === "received",
              active: po.status === "sent",
            },
            {
              label: "Nhận hàng",
              completed: po.status === "received",
              active: po.status === "partially_received",
            },
          ]}
        />
      </section>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {isDraft && lines.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                disabled={isPending}
                className="flex items-center gap-2 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-all hover:scale-[0.98] disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
                  boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
                }}
              >
                Gửi PO cho nhà cung cấp
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận gửi PO?</AlertDialogTitle>
                <AlertDialogDescription>
                  Gửi PO <strong>{po.po_number}</strong> với{" "}
                  <strong>{lines.length} dòng</strong>
                  {totalValue > 0 && (
                    <>
                      , tổng dự kiến{" "}
                      <strong>{totalValue.toLocaleString("vi-VN")} ₫</strong>
                    </>
                  )}
                  . Sau khi gửi không thể chỉnh sửa dòng.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction onClick={handleSendPo}>
                  Gửi PO
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {(po.status === "sent" || po.status === "partially_received") && (
          <button
            type="button"
            disabled={isPending}
            onClick={handleCreateGrn}
            className="flex items-center gap-2 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-all hover:scale-[0.98] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
            }}
          >
            <Plus className="size-4" />
            Tạo GRN từ PO này
          </button>
        )}
      </div>

      {/* Line items */}
      <POLineItemsTable
        lines={lines}
        deviations={deviations}
        isDraft={isDraft}
        isPending={isPending}
        isMobile={isMobile}
        onTogglePriceHistory={(ingredientId) => {
          if (historyIngredientId === ingredientId) {
            setPriceHistory(null);
            setHistoryIngredientId(null);
            return;
          }
          setHistoryIngredientId(ingredientId);
          fetchIngredientPriceHistory({
            ingredientId,
            supplierId: po.supplier_id,
          }).then((res) => {
            if (res.success) {
              setPriceHistory((res.data as PriceHistoryRow[]) ?? []);
            }
          });
        }}
        onRemoveLine={(lineId) => {
          startTransition(async () => {
            const res = await deletePurchaseOrderLine({ poId, lineId });
            if (!res.success) {
              toast.error(res.error ?? "Không thể xóa dòng PO");
              return;
            }
            toast.success("Đã xóa dòng");
            await reload();
          });
        }}
      />

      {/* Price history panel */}
      {priceHistory != null && historyIngredientId != null && (
        <PriceHistoryPanel
          priceHistory={priceHistory}
          ingredientName={
            lines.find((l) => l.ingredient_id === historyIngredientId)
              ?.ingredients?.name ?? `#${historyIngredientId}`
          }
          onClose={() => {
            setPriceHistory(null);
            setHistoryIngredientId(null);
          }}
        />
      )}

      {/* Linked GRNs */}
      <LinkedGRNsSection
        linkedGrns={linkedGrns}
        poStatus={po.status}
        isMobile={isMobile}
      />

      {/* Add line form — draft only */}
      {isDraft && (
        <AddLineForm
          ingredients={ingredients}
          isPending={isPending}
          onAddLine={(data) => {
            startTransition(async () => {
              const res = await upsertPurchaseOrderLine({
                poId,
                ingredientId: data.ingredientId,
                quantity: data.quantity,
                unit: data.unit,
                unitPriceEst: data.unitPriceEst,
              });
              if (!res.success) {
                toast.error(res.error ?? "Không thể lưu dòng PO");
                return;
              }
              toast.success("Đã lưu dòng");
              await reload();
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// POLineItemsTable
// ---------------------------------------------------------------------------
function POLineItemsTable({
  lines,
  deviations,
  isDraft,
  isPending,
  isMobile,
  onTogglePriceHistory,
  onRemoveLine,
}: {
  lines: PoLineRow[];
  deviations: Map<number, PriceDeviationRow>;
  isDraft: boolean;
  isPending: boolean;
  isMobile: boolean;
  onTogglePriceHistory: (ingredientId: number) => void;
  onRemoveLine: (lineId: number) => void;
}) {
  if (isMobile) {
    return (
      <div
        className="overflow-hidden rounded-2xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <h4 className="text-lg font-bold">Chi tiết danh mục hàng</h4>
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            {lines.length} dòng
          </span>
        </div>
        {lines.length === 0 ? (
          <div
            className="py-12 text-center text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            {isDraft
              ? "Chưa có dòng — thêm nguyên liệu bên dưới."
              : "Không có dòng chi tiết."}
          </div>
        ) : (
          <div
            className="divide-y"
            style={{
              borderColor:
                "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
            }}
          >
            {lines.map((l) => {
              const dev = deviations.get(l.ingredient_id);
              return (
                <div key={l.id} className="px-6 py-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm truncate">
                          {l.ingredients?.name ?? `#${l.ingredient_id}`}
                        </span>
                        {dev && <PriceDeviationBadge deviation={dev} />}
                      </div>
                      <p
                        className="text-xs mt-0.5"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        {l.quantity.toLocaleString("vi-VN")} {l.unit}
                        {l.unit_price_est != null && (
                          <> · {l.unit_price_est.toLocaleString("vi-VN")} ₫</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {l.unit_price_est != null && (
                        <button
                          type="button"
                          onClick={() => onTogglePriceHistory(l.ingredient_id)}
                          className="size-7 flex items-center justify-center rounded transition-colors"
                          style={{ color: "var(--md-on-surface-variant)" }}
                          aria-label="Lịch sử giá"
                        >
                          <History className="size-3.5" />
                        </button>
                      )}
                      {isDraft && (
                        <button
                          type="button"
                          className="size-7 flex items-center justify-center rounded transition-colors"
                          style={{ color: "var(--md-error)" }}
                          disabled={isPending}
                          onClick={() => onRemoveLine(l.id)}
                          aria-label="Xóa dòng"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {l.line_total != null && (
                    <p className="text-sm font-mono font-semibold text-right tabular-nums">
                      {l.line_total.toLocaleString("vi-VN")} ₫
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-2xl ambient-shadow"
      style={{
        backgroundColor: "var(--md-surface-lowest)",
        border:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <h4 className="text-lg font-bold">Chi tiết danh mục hàng</h4>
        <span
          className="text-xs font-medium"
          style={{ color: "var(--md-outline)" }}
        >
          {lines.length} dòng
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
            }}
          >
            <TableHead
              className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Nguyên liệu
            </TableHead>
            <TableHead
              className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Số lượng
            </TableHead>
            <TableHead
              className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Đơn vị
            </TableHead>
            <TableHead
              className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
              Đơn giá dự kiến
            </TableHead>
            <TableHead
              className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--md-outline)" }}
            >
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
                className="py-12 text-center"
                style={{ color: "var(--md-on-surface-variant)" }}
              >
                {isDraft
                  ? "Chưa có dòng — thêm nguyên liệu bên dưới."
                  : "Không có dòng chi tiết."}
              </TableCell>
            </TableRow>
          )}
          {lines.map((l) => {
            const dev = deviations.get(l.ingredient_id);
            return (
              <TableRow
                key={l.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                }}
              >
                <TableCell className="px-6 py-4 font-bold">
                  <div className="flex items-center gap-1.5">
                    {l.ingredients?.name ?? `#${l.ingredient_id}`}
                    {dev && <PriceDeviationBadge deviation={dev} />}
                    {l.unit_price_est != null && (
                      <button
                        type="button"
                        onClick={() => onTogglePriceHistory(l.ingredient_id)}
                        className="transition-colors"
                        style={{ color: "var(--md-on-surface-variant)" }}
                        aria-label="Lịch sử giá"
                      >
                        <History className="size-3.5" />
                      </button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-mono tabular-nums">
                  {l.quantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell
                  className="px-6 py-4"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {l.unit}
                </TableCell>
                <TableCell
                  className="px-6 py-4 text-right font-mono tabular-nums"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {l.unit_price_est != null
                    ? `${l.unit_price_est.toLocaleString("vi-VN")} ₫`
                    : "—"}
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-mono tabular-nums font-semibold">
                  {l.line_total != null
                    ? `${l.line_total.toLocaleString("vi-VN")} ₫`
                    : "—"}
                </TableCell>
                {isDraft && (
                  <TableCell className="px-6 py-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      style={{ color: "var(--md-error)" }}
                      disabled={isPending}
                      onClick={() => onRemoveLine(l.id)}
                      aria-label="Xóa dòng"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PriceHistoryPanel
// ---------------------------------------------------------------------------
function PriceHistoryPanel({
  priceHistory,
  ingredientName,
  onClose,
}: {
  priceHistory: PriceHistoryRow[];
  ingredientName: string;
  onClose: () => void;
}) {
  return (
    <div
      className="overflow-hidden rounded-2xl ambient-shadow"
      style={{
        backgroundColor: "var(--md-surface-lowest)",
        border:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <h3 className="text-sm font-bold">Lịch sử giá — {ingredientName}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Đóng
        </Button>
      </div>
      {priceHistory.length === 0 ? (
        <p
          className="text-sm py-8 text-center"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          Chưa có lịch sử nhập hàng cho nguyên liệu này.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
              }}
            >
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày nhận
              </TableHead>
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Phiếu GRN
              </TableHead>
              <TableHead
                className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Số lượng
              </TableHead>
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                ĐV
              </TableHead>
              <TableHead
                className="px-6 py-4 text-right text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Đơn giá
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {priceHistory.map((h) => (
              <TableRow
                key={h.grn_id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                }}
              >
                <TableCell className="px-6 py-4 text-sm">
                  {new Date(h.received_date).toLocaleDateString("vi-VN")}
                </TableCell>
                <TableCell className="px-6 py-4 text-sm font-mono">
                  <Link
                    href={`/inventory/grn/${h.grn_id}`}
                    className="hover:underline"
                    style={{ color: "var(--md-primary)" }}
                  >
                    {h.grn_number}
                  </Link>
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-mono text-sm tabular-nums">
                  {h.received_quantity.toLocaleString("vi-VN")}
                </TableCell>
                <TableCell
                  className="px-6 py-4 text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {h.unit}
                </TableCell>
                <TableCell className="px-6 py-4 text-right font-mono text-sm font-semibold tabular-nums">
                  {h.unit_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LinkedGRNsSection
// ---------------------------------------------------------------------------
function LinkedGRNsSection({
  linkedGrns,
  poStatus,
  isMobile,
}: {
  linkedGrns: LinkedGrnRow[];
  poStatus: string;
  isMobile: boolean;
}) {
  if (
    linkedGrns.length === 0 &&
    poStatus !== "sent" &&
    poStatus !== "partially_received"
  )
    return null;

  return (
    <div
      className="overflow-hidden rounded-2xl ambient-shadow"
      style={{
        backgroundColor: "var(--md-surface-lowest)",
        border:
          "1px solid color-mix(in srgb, var(--md-outline-variant) 20%, transparent)",
      }}
    >
      <div
        className="flex items-center justify-between border-b px-6 py-4"
        style={{
          borderColor:
            "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
        }}
      >
        <div className="flex items-center gap-2">
          <ClipboardList
            className="size-4"
            style={{ color: "var(--md-on-surface-variant)" }}
          />
          <h2 className="text-sm font-bold">Phiếu nhập kho liên kết</h2>
          {linkedGrns.length > 0 && (
            <StatusBadge status="pending" label={String(linkedGrns.length)} />
          )}
        </div>
      </div>
      {linkedGrns.length === 0 ? (
        <p
          className="px-6 py-8 text-center text-sm"
          style={{ color: "var(--md-on-surface-variant)" }}
        >
          Chưa có phiếu nhập — nhấn &quot;Tạo GRN từ PO này&quot; để bắt đầu
          nhập hàng.
        </p>
      ) : isMobile ? (
        <div
          className="divide-y"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
          }}
        >
          {linkedGrns.map((g) => (
            <Link
              key={g.id}
              href={`/inventory/grn/${g.id}`}
              className="flex items-center justify-between px-6 py-4 transition-colors"
            >
              <div className="space-y-0.5">
                <span className="font-mono text-sm font-bold">
                  {g.grn_number}
                </span>
                <p
                  className="text-xs"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {new Date(g.received_date).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
              <StatusBadge status={g.status} />
            </Link>
          ))}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
              }}
            >
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Số phiếu
              </TableHead>
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Trạng thái
              </TableHead>
              <TableHead
                className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Ngày nhận
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linkedGrns.map((g) => (
              <TableRow
                key={g.id}
                className="group transition-colors"
                style={{
                  borderColor:
                    "color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
                }}
              >
                <TableCell className="px-6 py-4 font-mono text-sm font-bold">
                  {g.grn_number}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell
                  className="px-6 py-4 text-sm tabular-nums"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {new Date(g.received_date).toLocaleDateString("vi-VN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </TableCell>
                <TableCell className="px-6 py-4">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    asChild
                    aria-label="Xem GRN"
                  >
                    <Link href={`/inventory/grn/${g.id}`}>
                      <History className="size-4" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddLineForm
// ---------------------------------------------------------------------------
function AddLineForm({
  ingredients,
  isPending,
  onAddLine,
}: {
  ingredients: IngredientRow[];
  isPending: boolean;
  onAddLine: (data: {
    ingredientId: number;
    quantity: number;
    unit: string;
    unitPriceEst: number | null;
  }) => void;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [unit, setUnit] = useState("");

  function handleIngredientChange(val: string) {
    setIngredientId(val);
    const ing = ingredients.find((x) => String(x.id) === val);
    if (ing) setUnit(ing.unit);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const iid = Number(ingredientId || fd.get("ingredientId"));
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
    onAddLine({
      ingredientId: iid,
      quantity: qty,
      unit: resolvedUnit,
      unitPriceEst,
    });
    setIngredientId("");
    setUnit("");
  }

  return (
    <div
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
        <h2 className="text-sm font-bold">Thêm dòng</h2>
      </div>
      <form onSubmit={handleSubmit} className="p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nguyên liệu</Label>
            <IngredientCombobox
              ingredients={ingredients}
              value={ingredientId}
              onValueChange={handleIngredientChange}
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
              id="unit"
              name="unit"
              required
              placeholder="kg"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="unitPriceEst">Đơn giá dự kiến (₫, tùy chọn)</Label>
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
        <div className="mt-4">
          <button
            type="submit"
            disabled={isPending || !ingredientId}
            className="flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-white shadow-lg transition-all hover:scale-[0.98] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
            }}
          >
            {isPending ? "Đang lưu…" : "Lưu dòng"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price deviation badge with tooltip
// ---------------------------------------------------------------------------
function PriceDeviationBadge({ deviation }: { deviation: PriceDeviationRow }) {
  const isExpensive = deviation.deviation_pct > 0;
  const Icon = isExpensive ? TrendingUp : TrendingDown;
  const sign = isExpensive ? "+" : "";
  const label = `${sign}${deviation.deviation_pct}%`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold cursor-help"
            style={{
              backgroundColor: isExpensive
                ? "var(--md-error-container)"
                : "var(--md-secondary-container)",
              color: isExpensive
                ? "var(--md-on-error-container)"
                : "var(--md-on-secondary-container)",
            }}
          >
            <Icon className="size-3" />
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p className="font-semibold">
              {isExpensive ? "Đắt hơn" : "Rẻ hơn"} trung bình{" "}
              {Math.abs(deviation.deviation_pct)}%
            </p>
            <p>
              TB {deviation.sample_count} lần gần nhất:{" "}
              <span className="font-mono font-semibold">
                {deviation.avg_price.toLocaleString("vi-VN")} ₫
              </span>
              /{deviation.unit}
            </p>
            <p>
              Giá hiện tại:{" "}
              <span className="font-mono font-semibold">
                {deviation.current_price.toLocaleString("vi-VN")} ₫
              </span>
              /{deviation.unit}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
