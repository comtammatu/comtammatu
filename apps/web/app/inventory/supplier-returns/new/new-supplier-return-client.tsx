"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { ArrowLeft as IconArrowLeft, Plus as IconPlus, Save as IconDeviceFloppy, Trash as IconTrash } from "lucide-react";
import { InventoryHeader } from "../../_components/inventory-header";
import { PhotoUploadInput } from "../../_components/photo-upload-input";
import { formatVND } from "../../_lib/format";
import { createSupplierReturnFromStock } from "../../supplier-return-actions";

type Branch = { id: number; name: string };
type Supplier = { id: number; name: string };
type Ingredient = {
  id: number;
  name: string;
  unit: string;
  unitCost: number;
};

type Line = {
  ingredientId: number | null;
  quantity: number;
  unitCost: number;
  unit: string;
  reasonDetail: string;
  photoUrl: string;
};

const RESOLUTION_OPTIONS = [
  { value: "replacement", label: "NCC giao bù" },
  { value: "credit_note", label: "Credit note (giảm công nợ)" },
  { value: "cash_refund", label: "Hoàn tiền mặt" },
] as const;

const REASON_OPTIONS = [
  { value: "damaged", label: "Hư hỏng" },
  { value: "wrong_item", label: "Sai mặt hàng" },
  { value: "expired", label: "Hết hạn" },
  { value: "quality_fail", label: "Không đạt QC" },
  { value: "other", label: "Khác" },
] as const;

function emptyLine(): Line {
  return {
    ingredientId: null,
    quantity: 0,
    unitCost: 0,
    unit: "",
    reasonDetail: "",
    photoUrl: "",
  };
}

export function NewSupplierReturnClient({
  tenantId,
  branches,
  suppliers,
  ingredients,
  defaultBranchId,
}: {
  tenantId: number;
  branches: Branch[];
  suppliers: Supplier[];
  ingredients: Ingredient[];
  defaultBranchId: number | null;
}) {
  const router = useRouter();
  const [isSaving, startSave] = useTransition();
  const [branchId, setBranchId] = useState<number | null>(defaultBranchId);
  const [supplierId, setSupplierId] = useState<number | null>(
    suppliers[0]?.id ?? null,
  );
  const [resolution, setResolution] = useState<string>("replacement");
  const [reason, setReason] = useState<string>("damaged");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const ingredientById = useMemo(() => {
    const map = new Map<number, Ingredient>();
    ingredients.forEach((i) => map.set(i.id, i));
    return map;
  }, [ingredients]);

  const totalValue = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0),
    [lines],
  );

  function patchLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => {
      const next = prev.slice();
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...patch };
      return next;
    });
  }

  function selectIngredient(idx: number, ingredientId: number) {
    const ing = ingredientById.get(ingredientId);
    if (!ing) return;
    patchLine(idx, {
      ingredientId,
      unit: ing.unit,
      unitCost: ing.unitCost,
    });
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): string | null {
    if (!branchId) return "Vui lòng chọn kho.";
    if (!supplierId) return "Vui lòng chọn nhà cung cấp.";
    const validLines = lines.filter(
      (l) => l.ingredientId != null && l.quantity > 0,
    );
    if (validLines.length === 0) {
      return "Phải có ít nhất 1 dòng nguyên liệu với số lượng > 0.";
    }
    for (const l of validLines) {
      if (l.unitCost < 0) return "Đơn giá không hợp lệ.";
    }
    return null;
  }

  function handleSubmit() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    startSave(async () => {
      const res = await createSupplierReturnFromStock({
        branchId: branchId!,
        supplierId: supplierId!,
        resolution: resolution as "replacement" | "credit_note" | "cash_refund",
        reason: reason as
          | "damaged"
          | "wrong_item"
          | "expired"
          | "quality_fail"
          | "other",
        notes: notes.trim() || null,
        lines: lines
          .filter((l) => l.ingredientId != null && l.quantity > 0)
          .map((l) => ({
            ingredientId: l.ingredientId!,
            quantity: l.quantity,
            unitCost: l.unitCost,
            reasonDetail: l.reasonDetail.trim() || null,
            photoUrl: l.photoUrl.trim() || null,
          })),
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể tạo phiếu trả hàng.");
        return;
      }
      const data = res.data as { return_id?: number } | undefined;
      toast.success("Đã tạo phiếu trả NCC (nháp). Xác nhận để giảm tồn kho.");
      if (data?.return_id) {
        router.push(`/inventory/supplier-returns/${data.return_id}`);
      } else {
        router.push("/inventory/supplier-returns");
      }
    });
  }

  return (
    <>
      <InventoryHeader
        title="Tạo phiếu trả NCC từ kho"
        actions={
          <Link
            href="/inventory/supplier-returns"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" /> Danh sách
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-5xl space-y-6">
          <Alert>
            <AlertDescription>
              Form này dành cho hàng <strong>đã nhập kho</strong> phát hiện hư
              hỏng / sai mặt hàng và cần trả NCC. Khi xác nhận phiếu, tồn kho
              sẽ bị trừ qua bút toán <code>supplier_return</code>. Nếu hàng vừa
              giao và chưa nhập, hãy đánh dấu <strong>Trả lại</strong> ngay
              trên GRN nháp thay vì dùng form này.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Thông tin chung</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Kho trả hàng</Label>
                <Select
                  value={branchId?.toString() ?? ""}
                  onValueChange={(v) => setBranchId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn kho…" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Nhà cung cấp</Label>
                <Select
                  value={supplierId?.toString() ?? ""}
                  onValueChange={(v) => setSupplierId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn NCC…" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id.toString()}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Lý do</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Cách xử lý</Label>
                <Select value={resolution} onValueChange={setResolution}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RESOLUTION_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Ghi chú</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: NCC đã đồng ý nhận lại trong ca giao tới…"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Mặt hàng trả</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
              >
                <IconPlus className="size-4" /> Thêm dòng
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lines.map((line, idx) => {
                const ing = line.ingredientId
                  ? ingredientById.get(line.ingredientId)
                  : null;
                const lineTotal = line.quantity * line.unitCost;
                return (
                  <div
                    key={idx}
                    className="space-y-3 rounded-lg border bg-card p-3"
                  >
                    <div className="grid gap-3 md:grid-cols-12">
                      <div className="md:col-span-5">
                        <Label className="text-xs text-muted-foreground">
                          Nguyên liệu
                        </Label>
                        <Select
                          value={line.ingredientId?.toString() ?? ""}
                          onValueChange={(v) =>
                            selectIngredient(idx, Number(v))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn nguyên liệu…" />
                          </SelectTrigger>
                          <SelectContent>
                            {ingredients.map((i) => (
                              <SelectItem
                                key={i.id}
                                value={i.id.toString()}
                              >
                                {i.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Số lượng {ing ? `(${ing.unit})` : ""}
                        </Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(e) =>
                            patchLine(idx, {
                              quantity: Number(e.target.value || 0),
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Đơn giá (₫)
                        </Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={line.unitCost}
                          onChange={(e) =>
                            patchLine(idx, {
                              unitCost: Number(e.target.value || 0),
                            })
                          }
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label className="text-xs text-muted-foreground">
                          Thành tiền
                        </Label>
                        <p className="mt-2 font-mono text-sm font-semibold">
                          {formatVND(lineTotal)} ₫
                        </p>
                      </div>
                      <div className="flex items-end justify-end md:col-span-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          onClick={() => removeLine(idx)}
                          disabled={lines.length === 1}
                          aria-label="Xóa dòng"
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Lý do chi tiết
                        </Label>
                        <Input
                          value={line.reasonDetail}
                          placeholder="VD: Đóng gói rách, mốc đáy…"
                          onChange={(e) =>
                            patchLine(idx, { reasonDetail: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Ảnh chứng từ
                        </Label>
                        <PhotoUploadInput
                          tenantId={tenantId}
                          folder={`supplier-return-draft/line-${idx}`}
                          value={line.photoUrl || null}
                          onChange={(url) =>
                            patchLine(idx, { photoUrl: url ?? "" })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex items-center justify-between pt-6">
              <p className="text-sm uppercase tracking-wider text-muted-foreground">
                Tổng giá trị trả
              </p>
              <p className="text-2xl font-black tabular-nums text-primary">
                {formatVND(totalValue)} ₫
              </p>
            </CardContent>
          </Card>

          <footer className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost">
              <Link href="/inventory/supplier-returns">
                <IconArrowLeft className="size-4" /> Hủy
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Phiếu sẽ được tạo ở trạng thái nháp</Badge>
              <Button
                type="button"
                disabled={isSaving}
                onClick={handleSubmit}
              >
                <IconDeviceFloppy className="size-5" /> Lưu phiếu nháp
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}
