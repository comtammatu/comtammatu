"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  PackageSearch,
  Pencil,
  Thermometer,
  Trash2,
  XCircle,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@comtammatu/ui/components/button";
import { Calendar } from "@comtammatu/ui/components/calendar";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@comtammatu/ui/components/popover";
import { IngredientCombobox } from "../../ingredient-combobox";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { StatusBadge, TimelineStepper } from "../../_components/shared";
import {
  confirmGrn,
  deleteGrnLine,
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
  branch_id?: number;
  po_id?: number | null;
  branches?: { id: number; name: string; is_headquarters: boolean } | null;
  suppliers?: { id: number; name: string } | null;
  purchase_orders?: { id: number; po_number: string } | null;
}

interface LineRow {
  id: number;
  ingredient_id: number;
  received_quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  quality_status: string;
  receiving_temperature: number | null;
  batch_number: string | null;
  expiry_date: string | null;
  ingredients: { id: number; name: string; unit: string } | null;
}

const QC_LABEL: Record<string, string> = {
  accepted: "Đạt",
  rejected: "Từ chối",
  partial: "Một phần",
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
  const isMobile = useIsMobile();
  const [grn, setGrn] = useState(initialGrn);
  const [lines, setLines] = useState(initialLines);
  const [isPending, startTransition] = useTransition();
  const [editingLine, setEditingLine] = useState<LineRow | null>(null);

  const isDraft = grn.status === "draft";
  const grandTotal = lines.reduce((sum, l) => sum + l.total_cost, 0);

  async function reload() {
    const res = await fetchGrnDetail(grnId);
    if (!res.success || !res.data) {
      toast.error("Không thể tải lại dữ liệu");
      return;
    }
    const d = res.data as { grn: GrnRecord; lines: LineRow[] };
    setGrn(d.grn);
    setLines(d.lines);
    router.refresh();
  }

  function doConfirm() {
    startTransition(async () => {
      const res = await confirmGrn(grnId);
      if (!res.success) {
        toast.error(res.error ?? "Không thể xác nhận phiếu nhập");
        return;
      }
      toast.success("Đã nhập kho và cập nhật WAC");
      await reload();
    });
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/inventory/grn"
        className="inline-flex items-center gap-1 text-sm hover:underline"
        style={{ color: "var(--md-on-surface-variant)" }}
      >
        <ArrowLeft className="size-4" /> Danh sách phiếu nhập
      </Link>

      {/* Document header card */}
      <GRNHeaderCard
        grn={grn}
        grandTotal={grandTotal}
        lineCount={lines.length}
        isDraft={isDraft}
        isPending={isPending}
        onConfirm={doConfirm}
      />

      {/* Line items */}
      <GRNLineItemsTable
        lines={lines}
        isMobile={isMobile}
        isDraft={isDraft}
        onEditLine={(line) => {
          setEditingLine(line);
          // Scroll form into view
          setTimeout(() => {
            document
              .getElementById("grn-line-form")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 50);
        }}
        onDeleteLine={(lineId) => {
          startTransition(async () => {
            const res = await deleteGrnLine(lineId);
            if (!res.success) {
              toast.error(res.error ?? "Không thể xoá dòng hàng");
              return;
            }
            toast.success("Đã xoá dòng hàng");
            await reload();
          });
        }}
      />

      {/* Add / edit line form — draft only */}
      {isDraft && (
        <AddGRNLineForm
          key={editingLine?.id ?? "new"}
          ingredients={ingredients}
          isPending={isPending}
          editingLine={editingLine}
          onCancelEdit={() => setEditingLine(null)}
          onAddLine={(data) => {
            startTransition(async () => {
              const res = await upsertGrnLine({
                grnId,
                ingredientId: data.ingredientId,
                receivedQuantity: data.quantity,
                unit: data.unit,
                unitCost: data.unitCost,
                qualityStatus: "accepted",
                receivingTemperature: data.temperature,
                batchNumber: data.batchNumber,
                expiryDate: data.expiryDate,
              });
              if (!res.success) {
                toast.error(res.error ?? "Không thể lưu dòng phiếu nhập");
                return;
              }
              toast.success(editingLine ? "Đã cập nhật dòng" : "Đã lưu dòng");
              setEditingLine(null);
              await reload();
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GRNHeaderCard — MD3 identity card
// ---------------------------------------------------------------------------
function GRNHeaderCard({
  grn,
  grandTotal,
  lineCount,
  isDraft,
  isPending,
  onConfirm,
}: {
  grn: GrnRecord;
  grandTotal: number;
  lineCount: number;
  isDraft: boolean;
  isPending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Identity Card */}
      <section
        className="relative overflow-hidden rounded-2xl ambient-shadow p-8"
        style={{ backgroundColor: "var(--md-surface-low)" }}
      >
        <div className="absolute right-8 top-8">
          <StatusBadge status={grn.status} />
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          {/* Column 1: Code + Supplier */}
          <div className="space-y-4">
            <div>
              <p
                className="mb-1 text-xs uppercase tracking-widest"
                style={{ color: "var(--md-outline)" }}
              >
                Mã phiếu nhập
              </p>
              <h1 className="text-3xl font-black tracking-tight font-mono">
                {grn.grn_number}
              </h1>
            </div>
            {grn.suppliers?.name && (
              <div>
                <p
                  className="mb-1 text-xs uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Nhà cung cấp
                </p>
                <p className="font-semibold">{grn.suppliers.name}</p>
              </div>
            )}
            {grn.purchase_orders?.po_number && (
              <div>
                <p
                  className="mb-1 text-xs uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Mã PO
                </p>
                <Link
                  href={`/inventory/purchase-orders/${grn.purchase_orders.id}`}
                  className="font-semibold hover:underline"
                  style={{ color: "var(--md-primary)" }}
                >
                  {grn.purchase_orders.po_number}
                </Link>
              </div>
            )}
          </div>

          {/* Column 2: Date + Branch */}
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
                Ngày nhập
              </p>
              <p className="font-semibold">
                {new Date(grn.received_date).toLocaleString("vi-VN")}
              </p>
            </div>
            {grn.branches?.name && (
              <div>
                <p
                  className="mb-1 text-xs uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Chi nhánh
                </p>
                <p className="font-semibold">
                  {grn.branches.name}
                  {grn.branches.is_headquarters && (
                    <StatusBadge status="active" label="Trụ sở" />
                  )}
                </p>
              </div>
            )}
            {grn.notes && (
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
                  {grn.notes}
                </p>
              </div>
            )}
          </div>

          {/* Column 3: Total */}
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
                Tổng giá trị nhập
              </p>
              <p
                className="text-2xl font-black tabular-nums"
                style={{ color: "var(--md-primary)" }}
              >
                {lineCount > 0 ? (
                  <>
                    {grandTotal.toLocaleString("vi-VN")}{" "}
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
              <p className="font-semibold">{lineCount} dòng</p>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline Stepper */}
      {grn.status !== "cancelled" ? (
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
                completed: grn.status === "confirmed",
                active: grn.status === "draft",
              },
              {
                label: "Đã nhập kho",
                completed: false,
                active: grn.status === "confirmed",
              },
            ]}
          />
        </section>
      ) : (
        <section
          className="flex items-center justify-center gap-2 overflow-hidden rounded-2xl py-6 ambient-shadow"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <XCircle className="size-4" style={{ color: "var(--md-error)" }} />
          <span
            className="text-sm font-bold"
            style={{ color: "var(--md-error)" }}
          >
            Đã hủy
          </span>
        </section>
      )}

      {/* Confirm action bar */}
      {isDraft && (
        <div
          className="flex items-center justify-between gap-4 rounded-2xl ambient-shadow px-6 py-4"
          style={{
            backgroundColor: "var(--md-surface-lowest)",
            border:
              "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <p
            className="text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            {lineCount === 0
              ? "Thêm ít nhất một dòng trước khi xác nhận."
              : `${lineCount} dòng — xác nhận để cập nhật tồn kho và WAC.`}
          </p>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || lineCount === 0}
            className="flex items-center gap-2 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-all hover:scale-[0.98] disabled:opacity-50"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
              boxShadow: "0 4px 14px rgba(211,84,0,0.2)",
            }}
          >
            <CheckCircle2 className="size-5" />
            {isPending ? "Đang xử lý…" : "Xác nhận nhập kho"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GRNLineItemsTable
// ---------------------------------------------------------------------------
function GRNLineItemsTable({
  lines,
  isMobile,
  isDraft,
  onEditLine,
  onDeleteLine,
}: {
  lines: LineRow[];
  isMobile: boolean;
  isDraft: boolean;
  onEditLine: (line: LineRow) => void;
  onDeleteLine: (lineId: number) => void;
}) {
  const hasAnyTemperature = lines.some((l) => l.receiving_temperature != null);
  const grandTotal = lines.reduce((sum, l) => sum + l.total_cost, 0);

  if (isMobile) {
    return (
      <div className="rounded-lg border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
          <h2 className="text-sm font-semibold">Chi tiết hàng hóa</h2>
          <span className="text-xs text-muted-foreground">
            {lines.length} dòng
          </span>
        </div>
        {lines.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <PackageSearch className="mx-auto mb-2 size-8 opacity-30" />
            <p className="text-sm">Không có dòng chi tiết.</p>
          </div>
        ) : (
          <>
            <div className="divide-y">
              {lines.map((l) => (
                <div key={l.id} className="p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-medium text-sm">
                        {l.ingredients?.name ?? `#${l.ingredient_id}`}
                      </span>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {l.received_quantity.toLocaleString("vi-VN")} {l.unit}{" "}
                          × {l.unit_cost.toLocaleString("vi-VN")} ₫
                        </span>
                        <StatusBadge
                          status={
                            l.quality_status === "accepted"
                              ? "completed"
                              : l.quality_status === "rejected"
                                ? "cancelled"
                                : "warning"
                          }
                          label={QC_LABEL[l.quality_status] ?? l.quality_status}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="font-mono text-sm font-semibold tabular-nums">
                        {l.total_cost.toLocaleString("vi-VN")} ₫
                      </span>
                      {isDraft && (
                        <>
                          <button
                            type="button"
                            onClick={() => onEditLine(l)}
                            className="rounded p-1 transition-colors hover:bg-muted"
                            aria-label="Sửa dòng hàng"
                          >
                            <Pencil className="size-3.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteLine(l.id)}
                            className="rounded p-1 transition-colors hover:bg-destructive/10"
                            aria-label="Xoá dòng hàng"
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Batch, expiry, temperature on mobile */}
                  {(l.batch_number ||
                    l.expiry_date ||
                    l.receiving_temperature != null) && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {l.batch_number && <span>Lô: {l.batch_number}</span>}
                      {l.expiry_date && (
                        <span>
                          HSD:{" "}
                          {new Date(l.expiry_date).toLocaleDateString("vi-VN", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                      )}
                      {l.receiving_temperature != null && (
                        <span>{l.receiving_temperature}°C</span>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t bg-muted/40 px-3 py-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Tổng cộng
              </span>
              <span className="font-mono text-base font-semibold tabular-nums">
                {grandTotal.toLocaleString("vi-VN")} ₫
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  // Desktop table
  return (
    <div className="rounded-lg border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
        <h2 className="text-sm font-semibold">Chi tiết hàng hóa</h2>
        <span className="text-xs text-muted-foreground">
          {lines.length} dòng
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/20 hover:bg-muted/20">
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              Nguyên liệu
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Số lượng
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              ĐVT
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Đơn giá
            </TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
              Thành tiền
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              Lô hàng
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              Hết hạn
            </TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wider">
              KT chất lượng
            </TableHead>
            {hasAnyTemperature && (
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                Nhiệt độ
              </TableHead>
            )}
            {isDraft && <TableHead className="w-16" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={hasAnyTemperature ? 9 : 8}
                className="py-12 text-center text-muted-foreground"
              >
                <PackageSearch className="mx-auto mb-2 size-8 opacity-30" />
                <p className="text-sm">Không có dòng chi tiết.</p>
              </TableCell>
            </TableRow>
          )}
          {lines.map((l) => (
            <TableRow
              key={l.id}
              className="hover:bg-muted/30 transition-colors"
            >
              <TableCell className="font-medium">
                {l.ingredients?.name ?? `#${l.ingredient_id}`}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {l.received_quantity.toLocaleString("vi-VN")}
              </TableCell>
              <TableCell className="text-muted-foreground">{l.unit}</TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                {l.unit_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums">
                {l.total_cost.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">
                {l.batch_number ?? "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {l.expiry_date
                  ? new Date(l.expiry_date).toLocaleDateString("vi-VN", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  : "—"}
              </TableCell>
              <TableCell>
                <StatusBadge
                  status={
                    l.quality_status === "accepted"
                      ? "completed"
                      : l.quality_status === "rejected"
                        ? "cancelled"
                        : "warning"
                  }
                  label={QC_LABEL[l.quality_status] ?? l.quality_status}
                />
              </TableCell>
              {hasAnyTemperature && (
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {l.receiving_temperature != null
                    ? `${l.receiving_temperature}°C`
                    : "—"}
                </TableCell>
              )}
              {isDraft && (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditLine(l)}
                      className="rounded p-1.5 transition-colors hover:bg-muted"
                      aria-label="Sửa dòng hàng"
                    >
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLine(l.id)}
                      className="rounded p-1.5 transition-colors hover:bg-destructive/10"
                      aria-label="Xoá dòng hàng"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </button>
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
        {lines.length > 0 && (
          <TableFooter>
            <TableRow className="bg-muted/40 font-semibold">
              <TableCell colSpan={4} className="text-right text-sm">
                Tổng cộng
              </TableCell>
              <TableCell className="text-right font-mono text-base tabular-nums">
                {grandTotal.toLocaleString("vi-VN")} ₫
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell />
              {hasAnyTemperature && <TableCell />}
              {isDraft && <TableCell />}
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddGRNLineForm — simplified: removed "days" mode for expiry, reset temp on change
// ---------------------------------------------------------------------------
function AddGRNLineForm({
  ingredients,
  isPending,
  editingLine,
  onCancelEdit,
  onAddLine,
}: {
  ingredients: IngredientRow[];
  isPending: boolean;
  editingLine: LineRow | null;
  onCancelEdit: () => void;
  onAddLine: (data: {
    ingredientId: number;
    quantity: number;
    unit: string;
    unitCost: number;
    temperature: number | null;
    batchNumber: string | null;
    expiryDate: string | null;
  }) => void;
}) {
  const [ingredientId, setIngredientId] = useState(
    editingLine ? String(editingLine.ingredient_id) : "",
  );
  const [temperature, setTemperature] = useState(
    editingLine?.receiving_temperature != null
      ? String(editingLine.receiving_temperature)
      : "",
  );
  const [batchNumber, setBatchNumber] = useState(
    editingLine?.batch_number ?? "",
  );
  const [expiryDate, setExpiryDate] = useState<Date | undefined>(
    editingLine?.expiry_date ? new Date(editingLine.expiry_date) : undefined,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  const selectedIngredient = ingredientId
    ? ingredients.find((i) => i.id === Number(ingredientId))
    : null;
  const isColdChain =
    selectedIngredient?.storage_type === "refrigerated" ||
    selectedIngredient?.storage_type === "frozen";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    const tempVal = temperature !== "" ? Number(temperature) : null;
    onAddLine({
      ingredientId: iid,
      quantity: qty,
      unit,
      unitCost,
      temperature: tempVal,
      batchNumber: batchNumber.trim() || null,
      expiryDate: expiryDate ? format(expiryDate, "yyyy-MM-dd") : null,
    });
    setIngredientId("");
    setTemperature("");
    setBatchNumber("");
    setExpiryDate(undefined);
  }

  return (
    <div id="grn-line-form" className="rounded-lg border bg-muted/20 shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          {editingLine
            ? `Sửa: ${editingLine.ingredients?.name ?? `#${editingLine.ingredient_id}`}`
            : "Thêm / cập nhật dòng hàng"}
        </h2>
        {editingLine && (
          <button
            type="button"
            onClick={onCancelEdit}
            className="text-xs text-muted-foreground hover:underline"
          >
            Huỷ sửa
          </button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Nguyên liệu *</Label>
            <IngredientCombobox
              ingredients={ingredients}
              value={ingredientId}
              onValueChange={(v) => {
                setIngredientId(v);
                setTemperature("");
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qty">Số lượng nhận *</Label>
            <Input
              id="qty"
              name="qty"
              type="number"
              step="any"
              min="0"
              placeholder="0"
              defaultValue={editingLine?.received_quantity ?? ""}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="unit">Đơn vị *</Label>
            <Input
              id="unit"
              name="unit"
              placeholder={
                ingredientId
                  ? (ingredients.find((i) => i.id === Number(ingredientId))
                      ?.unit ?? "kg")
                  : "kg"
              }
              defaultValue={editingLine?.unit ?? ""}
              required
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="unitCost">Đơn giá (₫) *</Label>
            <Input
              id="unitCost"
              name="unitCost"
              type="number"
              step="any"
              min="0"
              placeholder="0"
              defaultValue={editingLine?.unit_cost ?? ""}
              required
            />
          </div>

          {/* Batch number */}
          <div className="space-y-1.5">
            <Label htmlFor="batchNumber">Mã lô hàng</Label>
            <Input
              id="batchNumber"
              placeholder="Ví dụ: LOT-240901"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
            />
          </div>

          {/* Expiry date — simplified: date picker only */}
          <div className="space-y-1.5">
            <Label>Hạn sử dụng</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !expiryDate && "text-muted-foreground",
                  )}
                >
                  <CalendarDays className="mr-2 size-4 shrink-0" />
                  {expiryDate
                    ? format(expiryDate, "dd/MM/yyyy")
                    : "Chọn ngày hết hạn..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expiryDate}
                  onSelect={(d) => {
                    setExpiryDate(d);
                    setCalendarOpen(false);
                  }}
                  disabled={(d) => d < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {isColdChain && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label
                htmlFor="temperature"
                className="flex items-center gap-1.5"
              >
                <Thermometer className="size-4" />
                Nhiệt độ nhận (°C)
              </Label>
              <Input
                id="temperature"
                name="temperature"
                type="number"
                step="0.1"
                placeholder="vd: 4.5"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="sm" disabled={isPending || !ingredientId}>
            {isPending ? "Đang lưu…" : editingLine ? "Cập nhật" : "Lưu dòng"}
          </Button>
          {!editingLine && (
            <p className="text-xs text-muted-foreground">
              Nếu nguyên liệu đã có trong phiếu, giá trị sẽ được cập nhật.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
