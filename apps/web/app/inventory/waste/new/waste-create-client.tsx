"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { Trash as IconTrash } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { SearchableSelect } from "@/inventory/_components/searchable-select";
import { WasteReasonDropdown, isAlwaysTier2Reason, isRiskyReason } from "@/inventory/_components/waste-reason-dropdown";
import { WasteTierBadge } from "@/inventory/_components/waste-tier-badge";
import { WastePhotoUpload } from "@/inventory/_components/waste-photo-upload";
import { ShiftCapMeter } from "@/inventory/_components/shift-cap-meter";
import { BranchDailyCapBanner } from "@/inventory/_components/branch-daily-cap-banner";
import { AntiSplitRollingMeter } from "@/inventory/_components/anti-split-rolling-meter";
import { createWasteEntry } from "@/inventory/waste-actions";
import { formatVND } from "@comtammatu/shared/format";
import { FormattedNumberInput } from "@/components/form";

/* ─── Context shape from server component ─── */

import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";
export interface WasteFormContext {
  tenantId: number;
  branch: { id: number; name: string; kind: string };
  locations: Array<{ id: number; name: string; kind: string }>;
  ingredients: Array<{
    id: number;
    name: string;
    unit: string;
    unitCost: number | null;
  }>;
  capStatus: {
    shiftKey: string;
    shiftSum: number;
    shiftCap: number;
    branchToday: number;
    branchCap: number;
  };
}

/* ─── Client-side tier preview (mirrors DB trigger logic) ─── */

const TIER_1_VALUE = 150_000;
const TIER_2_VALUE = 500_000;
const SHIFT_CAP = 1_500_000;

function previewTier(line: {
  value: number;
  reasonCode: string;
  projectedShiftSum: number;
  projectedBranchSum: number;
  branchCap: number;
}): { tier: 0 | 1 | 2; photoRequired: boolean; approvalRequired: boolean } {
  const photoRequired =
    line.value >= TIER_1_VALUE ||
    isRiskyReason(line.reasonCode);
  const approvalRequired =
    line.value >= TIER_2_VALUE ||
    isAlwaysTier2Reason(line.reasonCode) ||
    line.projectedShiftSum >= SHIFT_CAP ||
    line.projectedBranchSum > line.branchCap;
  const tier: 0 | 1 | 2 = approvalRequired ? 2 : photoRequired ? 1 : 0;
  return { tier, photoRequired, approvalRequired };
}

/* ─── Form state ─── */

type LineState = {
  uid: string;
  ingredientId: number | null;
  unit: string;
  unitCost: string; // input string
  quantity: string; // input string
  reasonCode: string;
  note: string;
  photoUrls: string[];
};

function newLine(): LineState {
  return {
    uid: Math.random().toString(36).slice(2, 10),
    ingredientId: null,
    unit: "kg",
    unitCost: "",
    quantity: "",
    reasonCode: "",
    note: "",
    photoUrls: [],
  };
}

export function WasteCreateClient({ context }: { context: WasteFormContext }) {
  const router = useRouter();
  const [locationId, setLocationId] = useState<number | null>(
    context.locations[0]?.id ?? null,
  );
  const [formNotes, setFormNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>(() => [newLine()]);
  const [isSubmitting, startSubmit] = useTransition();

  const ingredientOptions = useMemo(
    () =>
      context.ingredients.map((i) => ({
        value: String(i.id),
        label: `${i.name} (${i.unit})`,
      })),
    [context.ingredients],
  );

  const ingredientById = useMemo(() => {
    const m = new Map<number, WasteFormContext["ingredients"][number]>();
    for (const i of context.ingredients) m.set(i.id, i);
    return m;
  }, [context.ingredients]);

  const totalValue = lines.reduce((sum, l) => {
    const q = Number(l.quantity) || 0;
    const c = Number(l.unitCost) || 0;
    return sum + q * c;
  }, 0);

  const projectedShiftSum = context.capStatus.shiftSum + totalValue;
  const projectedBranchSum = context.capStatus.branchToday + totalValue;

  function updateLine(uid: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(uid: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid)));
  }

  function addLine() {
    setLines((prev) => [...prev, newLine()]);
  }

  function handleIngredientChange(uid: string, value: string) {
    const id = Number(value);
    const ing = ingredientById.get(id);
    if (!ing) return;
    updateLine(uid, {
      ingredientId: id,
      unit: ing.unit,
      unitCost: ing.unitCost !== null ? String(ing.unitCost) : "",
    });
  }

  function handleSubmit() {
    if (locationId === null) {
      toast.error("Chọn location");
      return;
    }
    // Validate each line
    for (const l of lines) {
      if (l.ingredientId === null) {
        toast.error("Chọn nguyên liệu cho mỗi dòng");
        return;
      }
      if (!l.reasonCode) {
        toast.error("Chọn lý do cho mỗi dòng");
        return;
      }
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error("Số lượng phải > 0");
        return;
      }
      const cost = Number(l.unitCost);
      if (!Number.isFinite(cost) || cost <= 0) {
        toast.error("Đơn giá phải > 0");
        return;
      }
      // Preview tier — if photo required but none attached, block
      const value = qty * cost;
      const pv = previewTier({
        value,
        reasonCode: l.reasonCode,
        projectedShiftSum,
        projectedBranchSum,
        branchCap: context.capStatus.branchCap,
      });
      if (pv.photoRequired && l.photoUrls.length === 0) {
        toast.error(
          `Dòng "${ingredientById.get(l.ingredientId!)?.name ?? l.ingredientId}" cần ảnh (tier ${pv.tier})`,
        );
        return;
      }
    }

    startSubmit(async () => {
      const res = await createWasteEntry({
        branchId: context.branch.id,
        locationId,
        items: lines.map((l) => ({
          ingredient_id: l.ingredientId!,
          quantity: Number(l.quantity),
          unit: l.unit,
          unit_cost: Number(l.unitCost),
          reason_code: l.reasonCode as never,
          note: l.note || undefined,
          photo_urls: l.photoUrls,
        })),
        notes: formNotes || undefined,
        sourceType: "manual",
      });
      if (!res.success) {
        toast.error(res.error ?? "Không tạo được phiếu hủy");
        return;
      }
      toast.success(
        `Đã tạo phiếu ${res.data?.issueNumber} (${res.data?.itemsCreated} dòng)${res.data?.requiresApproval ? " • Chờ QLV duyệt" : ""}`,
      );
      router.push(`/inventory/issues/${res.data?.issueId}`);
    });
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Phiếu hủy hàng (waste)</h1>
          <p className="text-sm text-muted-foreground">
            {context.branch.name}{" "}
            <Badge variant="outline" className="ml-1 text-xs">
              shift: {context.capStatus.shiftKey || "?"}
            </Badge>
          </p>
        </div>
      </div>

      <BranchDailyCapBanner
        branchToday={context.capStatus.branchToday}
        branchCap={context.capStatus.branchCap}
        pendingDelta={totalValue}
      />

      <ShiftCapMeter
        shiftSum={context.capStatus.shiftSum}
        shiftCap={context.capStatus.shiftCap}
        pendingDelta={totalValue}
        shiftLabel={context.capStatus.shiftKey}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thông tin chung</CardTitle>
          <CardDescription>
            Các dòng sẽ tự compute tier trên server. Dòng có tier ≥1 cần ảnh;
            tier 2 cần QLV duyệt (4-eye, không tự duyệt).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label htmlFor="waste-loc">Location</Label>
            <Select
              value={locationId !== null ? String(locationId) : ""}
              onValueChange={(v) => setLocationId(Number(v))}
              disabled={isSubmitting}
            >
              <SelectTrigger id="waste-loc">
                <SelectValue placeholder="Chọn location" />
              </SelectTrigger>
              <SelectContent>
                {context.locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name} ({l.kind})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="waste-form-notes">Ghi chú chung (optional)</Label>
            <Textarea
              id="waste-form-notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              disabled={isSubmitting}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <ul className="space-y-3">
        {lines.map((line, idx) => {
          const qty = Number(line.quantity) || 0;
          const cost = Number(line.unitCost) || 0;
          const value = qty * cost;
          const preview = previewTier({
            value,
            reasonCode: line.reasonCode,
            projectedShiftSum,
            projectedBranchSum,
            branchCap: context.capStatus.branchCap,
          });
          return (
            <li key={line.uid}>
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-sm">Dòng #{idx + 1}</CardTitle>
                    <div className="flex items-center gap-2">
                      <WasteTierBadge
                        tier={preview.tier}
                        photoRequired={preview.photoRequired}
                        approvalRequired={preview.approvalRequired}
                      />
                      {lines.length > 1 ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          type="button"
                          onClick={() => removeLine(line.uid)}
                          disabled={isSubmitting}
                          aria-label="Xóa dòng"
                          className="text-destructive"
                        >
                          <IconTrash className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>{PRODUCT_VI.rawIngredient}</Label>
                    <SearchableSelect
                      options={ingredientOptions}
                      value={
                        line.ingredientId !== null ? String(line.ingredientId) : ""
                      }
                      onValueChange={(v) => handleIngredientChange(line.uid, v)}
                      placeholder="Chọn nguyên liệu"
                    />
                  </div>

                  <AntiSplitRollingMeter
                    branchId={context.branch.id}
                    ingredientId={line.ingredientId}
                    pendingDelta={value}
                    ingredientName={
                      line.ingredientId
                        ? ingredientById.get(line.ingredientId)?.name
                        : undefined
                    }
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`qty-${line.uid}`}>{FORM_VI.quantity}</Label>
                      <FormattedNumberInput
                        id={`qty-${line.uid}`}
                        maxFractionDigits={3}
                        value={line.quantity}
                        onValueChange={(value) =>
                          updateLine(line.uid, { quantity: value })
                        }
                        disabled={isSubmitting}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`cost-${line.uid}`}>
                        Đơn giá (VND / {line.unit})
                      </Label>
                      <FormattedNumberInput
                        id={`cost-${line.uid}`}
                        maxFractionDigits={0}
                        value={line.unitCost}
                        onValueChange={(value) =>
                          updateLine(line.uid, { unitCost: value })
                        }
                        disabled={isSubmitting}
                        placeholder="0"
                      />
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        Value: {formatVND(value)}
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`reason-${line.uid}`}>{FORM_VI.reason}</Label>
                    <WasteReasonDropdown
                      id={`reason-${line.uid}`}
                      value={line.reasonCode as never}
                      onChange={(v) =>
                        updateLine(line.uid, { reasonCode: v })
                      }
                      disabled={isSubmitting}
                    />
                  </div>

                  {preview.photoRequired ? (
                    <div>
                      <Label>
                        Ảnh chứng minh (bắt buộc tier {preview.tier})
                      </Label>
                      <WastePhotoUpload
                        tenantId={context.tenantId}
                        issueId={`draft-${line.uid}`}
                        value={line.photoUrls[0] ?? null}
                        onChange={(url) =>
                          updateLine(line.uid, {
                            photoUrls: url ? [url] : [],
                          })
                        }
                        disabled={isSubmitting}
                      />
                    </div>
                  ) : null}

                  <div>
                    <Label htmlFor={`note-${line.uid}`}>Ghi chú dòng</Label>
                    <Textarea
                      id={`note-${line.uid}`}
                      value={line.note}
                      onChange={(e) => updateLine(line.uid, { note: e.target.value })}
                      disabled={isSubmitting}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={addLine}
          disabled={isSubmitting}
        >
          + Thêm dòng
        </Button>
        <div
          className={cn(
            "text-sm font-medium tabular-nums",
            totalValue >= 500_000 ? "text-destructive" : "",
          )}
        >
          Tổng: {formatVND(totalValue)}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          {ACTIONS_VI.cancel}
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Spinner /> : "Tạo phiếu"}
        </Button>
      </div>
    </div>
  );
}
