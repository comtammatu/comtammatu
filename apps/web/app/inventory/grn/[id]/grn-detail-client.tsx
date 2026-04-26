"use client";

import { useMemo, useState, useTransition } from "react";
import type { FormEvent, TransitionStartFunction } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { PhotoUploadInput } from "../../_components/photo-upload-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  TriangleAlert as IconAlertTriangle,
  ArrowLeft as IconArrowLeft,
  CircleCheck as IconCircleCheck,
  Info as IconInfoCircle,
  PackageX as IconPackageOff,
  Save as IconDeviceFloppy,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { notify } from "@comtammatu/ui/lib/notify";
import { Combobox } from "@/components/form";
import { InventoryHeader } from "../../_components/inventory-header";
import { FormattedNumberInput } from "../../_components/formatted-number-input";
import { formatVND } from "../../_lib/format";
import { confirmGrn } from "../../procurement-actions";
import { deleteGrnLine, upsertGrnLine } from "../../grn-actions";
import { createSupplierReturnFromGrn } from "../../supplier-return-actions";
import { tRoute } from "../../_lib/dictionary";
import { m, messages } from "@lib/messages";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../../_lib/ui";
import type { IngredientRow } from "../../page";

export type GRNDetailItem = {
  lineId: number;
  ingredientId: number;
  name: string;
  sku: string;
  poQuantity: number | null;
  poUnitPrice: number | null;
  required: number;
  actual: number;
  rejected: number;
  rejectionReason: string;
  rejectedPhotoUrl: string;
  priceOverrideNote: string;
  priceOverridePhotoUrl: string;
  priceVariancePct: number | null;
  requiresReview: boolean;
  shortDeliveryAction:
    | "accept_and_close"
    | "wait_backorder"
    | "request_credit"
    | null;
  unit: string;
  cost: number;
  lot: string;
  expiry: string;
  expiryDisplay: string;
  temp: string | null;
  qualityStatus: "accepted" | "rejected" | "partial";
  status: string;
};

export type GRNDetail = {
  id: number;
  tenantId: number;
  code: string;
  poCode: string;
  poId?: number;
  branchId: number;
  supplierId: number;
  supplier: string;
  date: string;
  total: number;
  tax: number;
  status: string;
  items: GRNDetailItem[];
  qcSettings: {
    qtyShortTolerancePct: number;
    priceVarianceWarnPct: number;
    priceVarianceReviewPct: number;
    rejectRequiresPhoto: boolean;
  };
};

type EditableLine = GRNDetailItem & { dirty: boolean };

function deriveVariance(
  unitCost: number,
  poUnitPrice: number | null,
): number | null {
  if (poUnitPrice == null || poUnitPrice === 0) return null;
  return Number((((unitCost - poUnitPrice) / poUnitPrice) * 100).toFixed(2));
}

export function GRNDetailClient({
  grn,
  ingredients,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = searchParams.get("m") === "1";
  const isReview = searchParams.get("review") === "1";
  const [isConfirming, startConfirm] = useTransition();
  const [isSaving, startSave] = useTransition();
  const [isCreatingReturn, startCreateReturn] = useTransition();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>(() =>
    grn.items.map((it) => ({ ...it, dirty: false })),
  );

  const isDraft = grn.status === "draft";
  const qc = grn.qcSettings;

  const stats = useMemo(() => {
    const acceptedLines = lines.filter(
      (l) => l.qualityStatus !== "rejected" && l.actual > 0,
    ).length;
    const rejectedLines = lines.filter(
      (l) => l.qualityStatus === "rejected" || l.rejected > 0,
    ).length;
    const reviewLines = lines.filter((l) => {
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      return (
        l.requiresReview ||
        (variance != null && Math.abs(variance) > qc.priceVarianceReviewPct)
      );
    }).length;
    const total = lines.reduce((sum, l) => sum + l.cost * l.actual, 0);
    return { acceptedLines, rejectedLines, reviewLines, total };
  }, [lines, qc.priceVarianceReviewPct]);

  const hasRejections = lines.some(
    (l) => l.qualityStatus === "rejected" || l.rejected > 0,
  );
  const dirtyLines = lines.filter((l) => l.dirty);

  function patch(idx: number, p: Partial<EditableLine>) {
    setLines((prev) => {
      const next = prev.slice();
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...p, dirty: true };
      return next;
    });
  }

  async function handleSave() {
    if (dirtyLines.length === 0) {
      notify.info(messages.inventory.grn.saveEmpty);
      return;
    }
    startSave(async () => {
      let okCount = 0;
      for (const l of dirtyLines) {
        const res = await upsertGrnLine({
          grnId: grn.id,
          ingredientId: l.ingredientId,
          receivedQuantity: l.actual,
          unit: l.unit,
          unitCost: l.cost,
          qualityStatus: l.qualityStatus,
          rejectedQuantity: l.rejected,
          rejectionReason: l.rejectionReason || null,
          rejectedPhotoUrl: l.rejectedPhotoUrl || null,
          priceOverrideNote: l.priceOverrideNote || null,
          priceOverridePhotoUrl: l.priceOverridePhotoUrl || null,
          shortDeliveryAction: l.shortDeliveryAction,
          batchNumber: l.lot || null,
          expiryDate: l.expiry || null,
        });
        if (!res.success) {
          notify.error(
            m(messages.inventory.grn.saveLinesFailed, {
              name: l.name,
              reason: res.error ?? "Không thể lưu dòng.",
            }),
          );
          continue;
        }
        okCount++;
      }
      if (okCount > 0) {
        notify.success(
          m(messages.inventory.grn.saveLinesOk, {
            ok: okCount,
            total: dirtyLines.length,
          }),
        );
        // Mark saved rows clean; refresh server data via router
        setLines((prev) => prev.map((l) => ({ ...l, dirty: false })));
        router.refresh();
      }
    });
  }

  async function handleDeleteLine(line: EditableLine) {
    const ok = await confirm({
      title: "Xóa dòng GRN?",
      description: line.name,
      variant: "destructive",
      confirmText: "Xóa dòng",
    });
    if (!ok) return;

    startSave(async () => {
      const res = await deleteGrnLine({
        grnId: grn.id,
        lineId: line.lineId,
      });
      if (!res.success) {
        notify.error(res.error ?? "Không thể xóa dòng GRN.");
        return;
      }
      setLines((prev) => prev.filter((item) => item.lineId !== line.lineId));
      notify.success("Đã xóa dòng GRN.");
      router.refresh();
    });
  }

  function upsertLocalLine(line: EditableLine) {
    setLines((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.ingredientId === line.ingredientId,
      );
      if (existingIndex < 0) return [...prev, line];
      return prev.map((item, index) => (index === existingIndex ? line : item));
    });
    router.refresh();
  }

  function validateBeforeConfirm(): string | null {
    for (const l of lines) {
      if (l.rejected > 0 && !l.rejectionReason.trim()) {
        return `${l.name}: phải nhập lý do khi có hàng từ chối.`;
      }
      if (
        qc.rejectRequiresPhoto &&
        l.rejected > 0 &&
        !l.rejectedPhotoUrl.trim()
      ) {
        return `${l.name}: phải đính kèm ảnh khi có hàng từ chối.`;
      }
      if (l.qualityStatus === "rejected" && l.actual > 0) {
        return `${l.name}: đã đánh dấu từ chối toàn dòng — số thực nhận phải bằng 0.`;
      }
      const tolerance = qc.qtyShortTolerancePct;
      if (
        l.poQuantity != null &&
        l.poQuantity > 0 &&
        l.actual + l.rejected < l.poQuantity * (1 - tolerance / 100) &&
        !l.shortDeliveryAction
      ) {
        return `${l.name}: thiếu hàng vượt ngưỡng ${tolerance}% — phải chọn cách xử lý.`;
      }
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      if (
        variance != null &&
        Math.abs(variance) > qc.priceVarianceWarnPct &&
        !l.priceOverrideNote.trim()
      ) {
        return `${l.name}: giá lệch ${variance}% — bắt buộc nhập lý do.`;
      }
    }
    return null;
  }

  async function handleConfirmGrn() {
    if (dirtyLines.length > 0) {
      notify.error(messages.inventory.grn.confirmBlockedByDirty);
      return;
    }
    const validationError = validateBeforeConfirm();
    if (validationError) {
      notify.error(validationError);
      return;
    }
    const ok = await confirm({
      title: messages.inventory.grn.confirmGrnTitle,
      description: messages.inventory.grn.confirmGrnDesc,
      variant: "destructive",
      confirmText: "Chốt nhập kho",
    });
    if (!ok) return;
    startConfirm(async () => {
      const res = await confirmGrn(grn.id);
      if (!res.success) {
        notify.error(res.error ?? messages.inventory.grn.confirmFailed);
        return;
      }
      const reviewCount =
        (res.data && typeof res.data === "object" && !Array.isArray(res.data)
          ? (res.data as { review_count?: number }).review_count
          : 0) ?? 0;
      notify.success(
        reviewCount > 0
          ? m(messages.inventory.grn.confirmedWithReview, {
              count: reviewCount,
            })
          : messages.inventory.grn.confirmed,
      );
      if (isMobile) {
        router.push("/inventory/m/grn");
      } else if (grn.poId) {
        router.push(`/inventory/purchase-orders/${grn.poId}`);
      } else {
        router.push("/inventory/grn");
      }
    });
  }

  function handleCreateReturn() {
    if (!hasRejections) {
      notify.error(messages.inventory.grn.returnNoRejection);
      return;
    }
    startCreateReturn(async () => {
      const res = await createSupplierReturnFromGrn({
        grnId: grn.id,
        resolution: "replacement",
        reason: "damaged",
        notes: null,
      });
      if (!res.success) {
        notify.error(res.error ?? messages.inventory.grn.returnFailed);
        return;
      }
      const data = res.data as { return_id?: number } | undefined;
      notify.success(messages.inventory.grn.returnCreated);
      if (data?.return_id) {
        router.push(`/inventory/supplier-returns/${data.return_id}`);
      }
    });
  }

  return (
    <>
      <InventoryHeader
        title="Chi tiết phiếu nhập"
        actions={
          <Link
            href={isMobile ? "/inventory/m/grn" : "/inventory/grn"}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
          >
            <IconArrowLeft className="size-4" />{" "}
            {isMobile ? "Quay lại" : tRoute("/inventory/grn", "heading")}
          </Link>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-6">
          {isReview && isDraft ? (
            <Alert>
              <IconInfoCircle className="size-4" />
              <AlertDescription>
                Đã lưu phiếu nháp. Kiểm tra số lượng, giá nhập, đánh dấu hàng hư
                hỏng nếu có, rồi nhấn <strong>Chốt nhập kho</strong>.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                Phiếu nhập kho
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                {grn.code}
              </h1>
              <p className="text-sm text-muted-foreground">
                {`${grn.supplier} • ${grn.date}`}
              </p>
            </div>
            <Badge variant={getInventoryStatusBadgeVariant(grn.status)}>
              {getInventoryStatusLabel(grn.status)}
            </Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <SummaryCard label="PO liên kết">
              {grn.poCode && grn.poId ? (
                <Link
                  href={`/inventory/purchase-orders/${grn.poId}`}
                  className="text-primary hover:underline"
                >
                  {grn.poCode}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </SummaryCard>
            <SummaryCard label="Nhà cung cấp">{grn.supplier}</SummaryCard>
            <SummaryCard label="Tổng giá trị nhập">
              <span className="text-primary">{formatVND(stats.total)} ₫</span>
            </SummaryCard>
            <SummaryCard label="Cần kiểm tra giá">
              <span className={stats.reviewLines > 0 ? "text-destructive" : ""}>
                {stats.reviewLines} / {lines.length} dòng
              </span>
            </SummaryCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="overflow-hidden">
                <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Danh sách mặt hàng kiểm nhận</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {isDraft
                        ? `Tolerance: thiếu ≤ ${qc.qtyShortTolerancePct}% • Giá lệch ≥ ${qc.priceVarianceWarnPct}% bắt buộc lý do • ≥ ${qc.priceVarianceReviewPct}% gắn cờ kiểm tra`
                        : `${lines.length} dòng đã chốt`}
                    </p>
                  </div>
                  {isDraft ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddDialogOpen(true)}
                    >
                      <IconPlus className="size-4" />
                      Thêm dòng
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-4">
                  {lines.map((line, idx) => (
                    <LineRow
                      key={line.lineId}
                      tenantId={grn.tenantId}
                      grnId={grn.id}
                      line={line}
                      idx={idx}
                      isDraft={isDraft}
                      qc={qc}
                      onChange={(p) => patch(idx, p)}
                      onDelete={() => void handleDeleteLine(line)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Tổng hợp QC</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <Row
                    label="Hàng đạt chuẩn"
                    value={`${stats.acceptedLines}/${lines.length}`}
                    tone="success"
                  />
                  <Row
                    label="Có hàng hư/từ chối"
                    value={String(stats.rejectedLines)}
                    tone={stats.rejectedLines > 0 ? "warning" : "default"}
                  />
                  <Row
                    label="Cần kiểm tra giá"
                    value={String(stats.reviewLines)}
                    tone={stats.reviewLines > 0 ? "warning" : "default"}
                  />
                </CardContent>
              </Card>

              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="space-y-3 pt-6">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Tổng giá trị nhập kho
                  </p>
                  <p className="text-2xl font-black tabular-nums text-primary">
                    {formatVND(stats.total)} ₫
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          <footer className="flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {!isDraft ? (
                <Button asChild variant="ghost">
                  <Link
                    href={
                      isMobile
                        ? "/inventory/m/grn"
                        : grn.poId
                          ? `/inventory/purchase-orders/${grn.poId}`
                          : "/inventory/grn"
                    }
                  >
                    <IconArrowLeft className="size-5" /> Quay lại
                  </Link>
                </Button>
              ) : null}

              {hasRejections ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCreateReturn}
                  disabled={isCreatingReturn}
                >
                  <IconPackageOff className="size-4" />
                  Lập phiếu trả NCC
                </Button>
              ) : null}
            </div>

            {isDraft ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSave}
                  disabled={isSaving || dirtyLines.length === 0}
                >
                  <IconDeviceFloppy className="size-5" />
                  Lưu thay đổi{" "}
                  {dirtyLines.length > 0 ? `(${dirtyLines.length})` : ""}
                </Button>
                <Button
                  type="button"
                  disabled={isConfirming || dirtyLines.length > 0}
                  onClick={handleConfirmGrn}
                >
                  <IconCircleCheck className="size-5" />
                  Chốt nhập kho
                </Button>
              </div>
            ) : null}
          </footer>
        </div>
      </div>
      <AddGrnLineDialog
        grn={grn}
        ingredients={ingredients}
        isOpen={addDialogOpen}
        isPending={isSaving}
        onOpenChange={setAddDialogOpen}
        onSaved={upsertLocalLine}
        startTransition={startSave}
      />
    </>
  );
}

function AddGrnLineDialog({
  grn,
  ingredients,
  isOpen,
  isPending,
  onOpenChange,
  onSaved,
  startTransition,
}: {
  grn: GRNDetail;
  ingredients: IngredientRow[];
  isOpen: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (line: EditableLine) => void;
  startTransition: TransitionStartFunction;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  function resetForm() {
    setIngredientId("");
    setQuantity("");
    setUnit("");
    setUnitCost("");
    setBatchNumber("");
    setExpiryDate("");
  }

  function handleIngredientChange(value: string) {
    setIngredientId(value);
    const ingredient = ingredients.find((item) => item.id === Number(value));
    setUnit(ingredient?.purchase_unit ?? ingredient?.unit ?? "");
    setUnitCost(
      ingredient?.unit_cost != null ? String(Number(ingredient.unit_cost)) : "",
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedIngredientId = Number(ingredientId);
    const parsedQuantity = Number(quantity);
    const parsedUnitCost = unitCost.trim() ? Number(unitCost) : 0;
    const ingredient = ingredients.find(
      (item) => item.id === parsedIngredientId,
    );

    if (!parsedIngredientId || !ingredient) {
      notify.error("Chọn nguyên liệu.");
      return;
    }
    if (!Number.isFinite(parsedQuantity) || parsedQuantity < 0) {
      notify.error("Số lượng nhận không hợp lệ.");
      return;
    }
    if (!unit.trim()) {
      notify.error("Đơn vị không được để trống.");
      return;
    }
    if (!Number.isFinite(parsedUnitCost) || parsedUnitCost < 0) {
      notify.error("Đơn giá không hợp lệ.");
      return;
    }

    startTransition(async () => {
      const res = await upsertGrnLine({
        grnId: grn.id,
        ingredientId: parsedIngredientId,
        receivedQuantity: parsedQuantity,
        unit: unit.trim(),
        unitCost: parsedUnitCost,
        qualityStatus: "accepted",
        rejectedQuantity: 0,
        rejectionReason: null,
        rejectedPhotoUrl: null,
        priceOverrideNote: null,
        priceOverridePhotoUrl: null,
        shortDeliveryAction: null,
        batchNumber: batchNumber.trim() || null,
        expiryDate: expiryDate || null,
      });
      if (!res.success || !res.data) {
        notify.error(res.error ?? "Không thể lưu dòng GRN.");
        return;
      }

      const row = res.data as { id: number };
      onSaved({
        lineId: row.id,
        ingredientId: parsedIngredientId,
        name: ingredient.name,
        sku: ingredient.sku ?? "",
        poQuantity: null,
        poUnitPrice: null,
        required: parsedQuantity,
        actual: parsedQuantity,
        rejected: 0,
        rejectionReason: "",
        rejectedPhotoUrl: "",
        priceOverrideNote: "",
        priceOverridePhotoUrl: "",
        priceVariancePct: null,
        requiresReview: false,
        shortDeliveryAction: null,
        unit: unit.trim(),
        cost: parsedUnitCost,
        lot: batchNumber.trim(),
        expiry: expiryDate,
        expiryDisplay: expiryDate || "—",
        temp: null,
        qualityStatus: "accepted",
        status: "pass",
        dirty: false,
      });
      notify.success("Đã lưu dòng GRN.");
      onOpenChange(false);
      resetForm();
    });
  }

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Thêm dòng phiếu nhập</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Nguyên liệu *</Label>
            <Combobox
              value={ingredientId}
              onValueChange={handleIngredientChange}
              options={ingredients
                .filter((ingredient) => ingredient.is_active)
                .map((ingredient) => ({
                  value: String(ingredient.id),
                  label: ingredient.name,
                  hint: ingredient.purchase_unit ?? ingredient.unit,
                  keywords: [ingredient.sku ?? "", ingredient.category ?? ""],
                }))}
              placeholder="Chọn nguyên liệu"
              searchPlaceholder="Tìm tên, SKU, danh mục..."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-qty">Số lượng nhận *</Label>
              <FormattedNumberInput
                id="grn-line-qty"
                value={quantity}
                onValueChange={setQuantity}
                maxFractionDigits={3}
                placeholder="0"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-unit">Đơn vị *</Label>
              <Input
                id="grn-line-unit"
                value={unit}
                readOnly
                aria-readonly="true"
                placeholder="kg"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-cost">Đơn giá *</Label>
              <FormattedNumberInput
                id="grn-line-cost"
                value={unitCost}
                onValueChange={setUnitCost}
                maxFractionDigits={0}
                placeholder="0"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-batch">Số lô</Label>
              <Input
                id="grn-line-batch"
                value={batchNumber}
                onChange={(event) => setBatchNumber(event.target.value)}
                placeholder="—"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grn-line-expiry">HSD</Label>
              <Input
                id="grn-line-expiry"
                type="date"
                value={expiryDate}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              <IconPlus className="size-4" />
              Lưu dòng
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent>
        <Badge variant="secondary">{label}</Badge>
        <div className="mt-3 text-lg font-semibold">{children}</div>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-primary"
        : "";
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-lg font-bold ${toneClass}`}>{value}</span>
    </div>
  );
}

function LineRow({
  tenantId,
  grnId,
  line,
  idx,
  isDraft,
  qc,
  onChange,
  onDelete,
}: {
  tenantId: number;
  grnId: number;
  line: EditableLine;
  idx: number;
  isDraft: boolean;
  qc: GRNDetail["qcSettings"];
  onChange: (p: Partial<EditableLine>) => void;
  onDelete: () => void;
}) {
  const variance = deriveVariance(line.cost, line.poUnitPrice);
  const variancesLabel =
    variance != null ? `${variance > 0 ? "+" : ""}${variance}%` : "—";
  const varianceTone =
    variance == null
      ? "text-muted-foreground"
      : Math.abs(variance) > qc.priceVarianceReviewPct
        ? "text-destructive font-bold"
        : Math.abs(variance) > qc.priceVarianceWarnPct
          ? "text-warning font-semibold"
          : "text-muted-foreground";

  const shortDeliveryRequired =
    line.poQuantity != null &&
    line.poQuantity > 0 &&
    line.actual + line.rejected <
      line.poQuantity * (1 - qc.qtyShortTolerancePct / 100);

  if (!isDraft) {
    return (
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold">{line.name}</p>
            <p className="text-xs text-muted-foreground">
              {line.required} {line.unit} đặt → {line.actual} {line.unit} nhận
              {line.rejected > 0 ? ` • Trả ${line.rejected} ${line.unit}` : ""}
            </p>
          </div>
          {line.qualityStatus === "rejected" || line.rejected > 0 ? (
            <IconAlertTriangle className="size-5 text-warning" />
          ) : (
            <IconCircleCheck className="size-5 text-success" />
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
          <Stat label="Giá nhập">{formatVND(line.cost)} ₫</Stat>
          <Stat label="Giá PO">
            {line.poUnitPrice != null
              ? `${formatVND(line.poUnitPrice)} ₫`
              : "—"}
          </Stat>
          <Stat label="Lệch giá">
            <span className={varianceTone}>{variancesLabel}</span>
          </Stat>
          <Stat label="HSD">{line.expiryDisplay}</Stat>
        </div>
        {line.rejectionReason ? (
          <p className="mt-2 text-xs text-muted-foreground">
            <span className="font-semibold">Lý do từ chối:</span>{" "}
            {line.rejectionReason}
          </p>
        ) : null}
        {line.priceOverrideNote ? (
          <p className="mt-1 text-xs text-muted-foreground">
            <span className="font-semibold">Lý do giá lệch:</span>{" "}
            {line.priceOverrideNote}
          </p>
        ) : null}
        {line.requiresReview ? (
          <Badge variant="destructive" className="mt-2">
            Cần kiểm tra
          </Badge>
        ) : null}
      </div>
    );
  }

  // Draft mode — editable
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold">{line.name}</p>
          <p className="text-xs text-muted-foreground">
            Đặt: {line.poQuantity ?? "—"} {line.unit} • Giá PO:{" "}
            {line.poUnitPrice != null
              ? `${formatVND(line.poUnitPrice)} ₫`
              : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm ${varianceTone}`}>
            Lệch giá: {variancesLabel}
          </span>
          {line.dirty ? (
            <Badge variant="outline" className="text-xs">
              chưa lưu
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Xóa dòng"
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Field id={`actual-${idx}`} label={`Thực nhận (${line.unit})`}>
          <FormattedNumberInput
            id={`actual-${idx}`}
            maxFractionDigits={3}
            value={String(line.actual)}
            onValueChange={(value) => onChange({ actual: Number(value || 0) })}
          />
        </Field>
        <Field id={`rejected-${idx}`} label={`Trả lại (${line.unit})`}>
          <FormattedNumberInput
            id={`rejected-${idx}`}
            maxFractionDigits={3}
            value={String(line.rejected)}
            onValueChange={(value) =>
              onChange({
                rejected: Number(value || 0),
                qualityStatus:
                  Number(value || 0) > 0 && line.actual === 0
                    ? "rejected"
                    : Number(value || 0) > 0
                      ? "partial"
                      : "accepted",
              })
            }
          />
        </Field>
        <Field id={`cost-${idx}`} label="Đơn giá (₫)">
          <FormattedNumberInput
            id={`cost-${idx}`}
            maxFractionDigits={0}
            value={String(line.cost)}
            onValueChange={(value) => onChange({ cost: Number(value || 0) })}
          />
        </Field>
        <Field id={`expiry-${idx}`} label="HSD">
          <Input
            id={`expiry-${idx}`}
            type="date"
            value={line.expiry || ""}
            onChange={(e) => onChange({ expiry: e.target.value })}
          />
        </Field>
      </div>

      {line.rejected > 0 || line.qualityStatus === "rejected" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field id={`reason-${idx}`} label="Lý do từ chối *">
            <Textarea
              id={`reason-${idx}`}
              rows={2}
              value={line.rejectionReason}
              placeholder="VD: Sườn thâm, đóng gói rách, cận date <3 ngày…"
              onChange={(e) => onChange({ rejectionReason: e.target.value })}
            />
          </Field>
          <Field
            id={`reject-photo-${idx}`}
            label={`Ảnh chứng từ${qc.rejectRequiresPhoto ? " *" : ""}`}
          >
            <PhotoUploadInput
              tenantId={tenantId}
              folder={`grn/${grnId}/rejected/${line.lineId}`}
              value={line.rejectedPhotoUrl || null}
              onChange={(url) => onChange({ rejectedPhotoUrl: url ?? "" })}
            />
          </Field>
        </div>
      ) : null}

      {variance != null && Math.abs(variance) > qc.priceVarianceWarnPct ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field id={`override-${idx}`} label="Lý do giá lệch *">
            <Textarea
              id={`override-${idx}`}
              rows={2}
              value={line.priceOverrideNote}
              placeholder={
                Math.abs(variance) > qc.priceVarianceReviewPct
                  ? `Giá lệch ${variance}% vượt ngưỡng kiểm tra ${qc.priceVarianceReviewPct}%. Bắt buộc nhập lý do + ảnh hóa đơn NCC.`
                  : `Giá lệch ${variance}% vượt ngưỡng cảnh báo ${qc.priceVarianceWarnPct}%. Nhập lý do để audit.`
              }
              onChange={(e) => onChange({ priceOverrideNote: e.target.value })}
            />
          </Field>
          {Math.abs(variance) > qc.priceVarianceReviewPct ? (
            <Field id={`override-photo-${idx}`} label="Ảnh hóa đơn NCC *">
              <PhotoUploadInput
                tenantId={tenantId}
                folder={`grn/${grnId}/price-override/${line.lineId}`}
                value={line.priceOverridePhotoUrl || null}
                onChange={(url) =>
                  onChange({ priceOverridePhotoUrl: url ?? "" })
                }
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {shortDeliveryRequired ? (
        <Field id={`short-${idx}`} label="Xử lý hàng thiếu *">
          <Select
            value={line.shortDeliveryAction ?? ""}
            onValueChange={(v) =>
              onChange({
                shortDeliveryAction: v as EditableLine["shortDeliveryAction"],
              })
            }
          >
            <SelectTrigger id={`short-${idx}`}>
              <SelectValue placeholder="Chọn cách xử lý…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="accept_and_close">
                Chấp nhận, đóng PO (không chờ giao bù)
              </SelectItem>
              <SelectItem value="wait_backorder">
                Chờ NCC giao bù (giữ PO partially_received)
              </SelectItem>
              <SelectItem value="request_credit">
                Yêu cầu credit note / trả tiền
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Field id={`lot-${idx}`} label="Số lô">
        <Input
          id={`lot-${idx}`}
          value={line.lot}
          placeholder="—"
          onChange={(e) => onChange({ lot: e.target.value })}
        />
      </Field>
    </div>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono">{children}</p>
    </div>
  );
}
