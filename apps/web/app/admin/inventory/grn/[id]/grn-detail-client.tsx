"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  FileText,
  PackageSearch,
  Thermometer,
  XCircle,
} from "lucide-react";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
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
  branch_id?: number;
  branches?: { id: number; name: string; is_headquarters: boolean } | null;
  suppliers?: { id: number; name: string } | null;
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
  ingredients: { id: number; name: string; unit: string } | null;
}

type GrnStatus = "draft" | "confirmed" | "cancelled";

const STATUS_STEPS: { key: GrnStatus; label: string }[] = [
  { key: "draft", label: "Nháp" },
  { key: "confirmed", label: "Đã nhập kho" },
];

function StatusStepper({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="flex items-center gap-2">
        <XCircle className="size-4 text-destructive" />
        <span className="text-sm font-medium text-destructive">Đã hủy</span>
      </div>
    );
  }

  const currentIdx = STATUS_STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center gap-0">
      {STATUS_STEPS.map((step, idx) => {
        const isDone = idx < currentIdx;
        const isCurrent = idx === currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                  isDone
                    ? "border-success bg-success text-white"
                    : isCurrent
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {isDone ? (
                  <CheckCircle2 className="size-4" />
                ) : isCurrent ? (
                  <CircleDot className="size-3.5" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isCurrent
                    ? "text-primary"
                    : isDone
                      ? "text-success"
                      : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>
            {idx < STATUS_STEPS.length - 1 && (
              <div
                className={cn(
                  "mx-2 mb-5 h-0.5 w-12",
                  idx < currentIdx ? "bg-success" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [grn, setGrn] = useState(initialGrn);
  const [lines, setLines] = useState(initialLines);
  const [ingredientId, setIngredientId] = useState("");
  const [temperature, setTemperature] = useState("");
  const [isPending, startTransition] = useTransition();

  const isDraft = grn.status === "draft";

  const selectedIngredient = ingredientId
    ? ingredients.find((i) => i.id === Number(ingredientId))
    : null;
  const isColdChain =
    selectedIngredient?.storage_type === "refrigerated" ||
    selectedIngredient?.storage_type === "frozen";

  const hasAnyTemperature = lines.some((l) => l.receiving_temperature != null);

  const grandTotal = lines.reduce((sum, l) => sum + l.total_cost, 0);

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
    const tempVal = temperature !== "" ? Number(temperature) : null;
    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId,
        ingredientId: iid,
        receivedQuantity: qty,
        unit,
        unitCost,
        qualityStatus: "accepted",
        receivingTemperature: tempVal,
      });
      if (!res.success) {
        toast.error(res.error ?? "Không lưu được dòng");
        return;
      }
      toast.success("Đã lưu dòng");
      setIngredientId("");
      setTemperature("");
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
      {/* Back link */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/admin/inventory/grn">
          <ArrowLeft className="mr-1.5 size-4" />
          Danh sách phiếu nhập
        </Link>
      </Button>

      {/* Document header card */}
      <div className="rounded-lg border bg-card shadow-sm">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          {/* Left: identity */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-bold tracking-tight">
                {grn.grn_number}
              </h1>
              <Badge
                className={cn(
                  grn.status === "confirmed"
                    ? "bg-success/10 text-success border-success/30"
                    : grn.status === "cancelled"
                      ? "bg-destructive/10 text-destructive border-destructive/30"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {grn.status === "confirmed"
                  ? "Đã nhập kho"
                  : grn.status === "cancelled"
                    ? "Đã hủy"
                    : "Nháp"}
              </Badge>
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarDays className="size-4 shrink-0" />
                <span>
                  {new Date(grn.received_date).toLocaleString("vi-VN")}
                </span>
              </div>
              {grn.branches?.name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="size-4 shrink-0" />
                  <span>
                    {grn.branches.name}
                    {grn.branches.is_headquarters && (
                      <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs font-medium">
                        Trụ sở
                      </span>
                    )}
                  </span>
                </div>
              )}
              {grn.suppliers?.name && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <PackageSearch className="size-4 shrink-0" />
                  <span>NCC: {grn.suppliers.name}</span>
                </div>
              )}
              {grn.notes && (
                <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                  <FileText className="size-4 shrink-0" />
                  <span>{grn.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right: total + stepper */}
          <div className="flex flex-col items-start gap-4 sm:items-end">
            <StatusStepper status={grn.status} />
            {lines.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Tổng giá trị</p>
                <p className="font-mono text-xl font-bold tabular-nums">
                  {grandTotal.toLocaleString("vi-VN")}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    ₫
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Confirm action bar — only when draft */}
        {isDraft && (
          <div className="flex items-center justify-between gap-4 border-t bg-muted/30 px-5 py-3">
            <p className="text-sm text-muted-foreground">
              {lines.length === 0
                ? "Thêm ít nhất một dòng trước khi xác nhận."
                : `${lines.length} dòng — xác nhận để cập nhật tồn kho và WAC.`}
            </p>
            <Button
              type="button"
              onClick={doConfirm}
              disabled={isPending || lines.length === 0}
            >
              {isPending ? "Đang xử lý…" : "Xác nhận nhập kho"}
            </Button>
          </div>
        )}
      </div>

      {/* Line items table */}
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
              <TableHead className="hidden sm:table-cell text-xs font-semibold uppercase tracking-wider">
                KT chất lượng
              </TableHead>
              {hasAnyTemperature && (
                <TableHead className="hidden sm:table-cell text-right text-xs font-semibold uppercase tracking-wider">
                  Nhiệt độ
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={hasAnyTemperature ? 7 : 6}
                  className="py-12 text-center text-muted-foreground"
                >
                  <PackageSearch className="mx-auto mb-2 size-8 opacity-30" />
                  <p className="text-sm">
                    {isDraft
                      ? "Thêm ít nhất một dòng bên dưới."
                      : "Không có dòng chi tiết."}
                  </p>
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
                <TableCell className="text-muted-foreground">
                  {l.unit}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                  {l.unit_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell className="text-right font-mono font-semibold tabular-nums">
                  {l.total_cost.toLocaleString("vi-VN")} ₫
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge
                    className={cn(
                      "text-xs",
                      l.quality_status === "accepted"
                        ? "bg-success/10 text-success border-success/30"
                        : l.quality_status === "rejected"
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-warning/10 text-warning border-warning/30",
                    )}
                  >
                    {QC_LABEL[l.quality_status] ?? l.quality_status}
                  </Badge>
                </TableCell>
                {hasAnyTemperature && (
                  <TableCell className="hidden sm:table-cell text-right font-mono tabular-nums text-muted-foreground">
                    {l.receiving_temperature != null
                      ? `${l.receiving_temperature}°C`
                      : "—"}
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
                <TableCell className="hidden sm:table-cell" />
                {hasAnyTemperature && (
                  <TableCell className="hidden sm:table-cell" />
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {/* Add / update line form — draft only */}
      {isDraft && (
        <div className="rounded-lg border bg-muted/20 shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Thêm / cập nhật dòng hàng</h2>
          </div>
          <form onSubmit={addLine} className="p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nguyên liệu *</Label>
                <Select
                  value={ingredientId}
                  onValueChange={(v) => {
                    setIngredientId(v);
                    setTemperature("");
                  }}
                  required
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nguyên liệu…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((i) => (
                      <SelectItem key={i.id} value={String(i.id)}>
                        {i.name}
                        <span className="ml-1.5 text-muted-foreground">
                          ({i.unit})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  required
                />
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
              <Button
                type="submit"
                size="sm"
                disabled={isPending || !ingredientId}
              >
                {isPending ? "Đang lưu…" : "Lưu dòng"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Nếu nguyên liệu đã có trong phiếu, giá trị sẽ được cập nhật.
              </p>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
