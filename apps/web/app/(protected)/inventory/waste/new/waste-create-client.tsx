"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Combobox, FormattedNumberInput } from "@/components/form";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  WasteReasonDropdown,
  isAlwaysTier2Reason,
  isRiskyReason,
} from "@/(protected)/inventory/_components/waste-reason-dropdown";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { WastePhotoUpload } from "@/(protected)/inventory/_components/waste-photo-upload";
import { ShiftCapMeter } from "@/(protected)/inventory/_components/shift-cap-meter";
import { BranchDailyCapBanner } from "@/(protected)/inventory/_components/branch-daily-cap-banner";
import { AntiSplitRollingMeter } from "@/(protected)/inventory/_components/anti-split-rolling-meter";
import { createWasteEntry } from "@/(protected)/inventory/waste-actions";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import {
  AppDetailFooter,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";

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
    issueUnits: Array<{
      unitId: number;
      code: string;
      label: string;
      isBase: boolean;
    }>;
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
    line.value >= TIER_1_VALUE || isRiskyReason(line.reasonCode);
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
  entryUnitId: string;
  unitCost: string; // input string
  quantity: string; // input string
  reasonCode: string;
  note: string;
  photoUrls: string[];
};

function newLine(uid: string): LineState {
  return {
    uid,
    ingredientId: null,
    unit: "kg",
    entryUnitId: "",
    unitCost: "",
    quantity: "",
    reasonCode: "",
    note: "",
    photoUrls: [],
  };
}

export function WasteCreateClient({
  context,
  successHref,
  cancelHref,
  embedded = false,
}: {
  context: WasteFormContext;
  successHref?: string;
  cancelHref?: string;
  embedded?: boolean;
}) {
  const router = useRouter();
  const nextLineId = useRef(1);
  const [locationId, setLocationId] = useState<number | null>(
    context.locations[0]?.id ?? null,
  );
  const [formNotes, setFormNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>(() => [newLine("line-0")]);
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
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid),
    );
  }

  function addLine() {
    const uid = `line-${nextLineId.current}`;
    nextLineId.current += 1;
    setLines((prev) => [...prev, newLine(uid)]);
  }

  function handleIngredientChange(uid: string, value: string) {
    const id = Number(value);
    const ing = ingredientById.get(id);
    if (!ing) return;
    const defaultUnit =
      ing.issueUnits.find((u) => u.isBase) ?? ing.issueUnits[0] ?? null;
    updateLine(uid, {
      ingredientId: id,
      unit: defaultUnit?.label ?? ing.unit,
      entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
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
          entry_unit_id: l.entryUnitId ? Number(l.entryUnitId) : null,
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
      router.push(successHref ?? `/inventory/issues/${res.data?.issueId}`);
    });
  }

  const header = (
    <AppPageHeader
      eyebrow="Kho hàng"
      title={messages.inventory.waste.title}
      description={
        <>
          {context.branch.name}{" "}
          <Badge variant="outline" className="ml-1 text-xs">
            {messages.inventory.waste.shiftPrefix}{" "}
            {context.capStatus.shiftKey || "?"}
          </Badge>
        </>
      }
    />
  );

  const content = (
    <>
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

      <AppSection
        title={messages.inventory.waste.generalInfoTitle}
        description={messages.inventory.waste.generalInfoDescription}
      >
        <div>
          <Label htmlFor="waste-loc">{messages.inventory.waste.location}</Label>
          <Select
            value={locationId !== null ? String(locationId) : ""}
            onValueChange={(v) => setLocationId(Number(v))}
            disabled={isSubmitting}
          >
            <SelectTrigger
              id="waste-loc"
              size={embedded ? "touch" : "default"}
              className="w-full"
            >
              <SelectValue
                placeholder={messages.inventory.waste.chooseLocation}
              />
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
          <Label htmlFor="waste-form-notes">
            {messages.inventory.waste.generalNotes}
          </Label>
          <Textarea
            id="waste-form-notes"
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            disabled={isSubmitting}
            rows={2}
          />
        </div>
      </AppSection>

      <ItemGroup className="flex flex-col gap-3 p-0 rounded-none border-0">
        {lines.map((line, idx) => {
          const qty = Number(line.quantity) || 0;
          const cost = Number(line.unitCost) || 0;
          const value = qty * cost;
          const lineIssueUnits =
            line.ingredientId !== null
              ? (ingredientById.get(line.ingredientId)?.issueUnits ?? [])
              : [];
          const preview = previewTier({
            value,
            reasonCode: line.reasonCode,
            projectedShiftSum,
            projectedBranchSum,
            branchCap: context.capStatus.branchCap,
          });
          return (
            <Item
              key={line.uid}
              variant="outline"
              className="rounded-lg border bg-card p-0 flex flex-col items-stretch"
            >
              <div className="p-4 pb-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-heading text-sm font-semibold">
                    {messages.inventory.waste.lineTitle(idx + 1)}
                  </div>
                  <div className="flex items-center gap-2">
                    <WasteTierBadge
                      tier={preview.tier}
                      photoRequired={preview.photoRequired}
                      approvalRequired={preview.approvalRequired}
                    />
                    {lines.length > 1 ? (
                      <Button
                        size={embedded ? "icon-touch" : "icon"}
                        variant="ghost"
                        type="button"
                        onClick={() => removeLine(line.uid)}
                        disabled={isSubmitting}
                        aria-label={messages.inventory.waste.removeLineAria}
                        className="text-destructive"
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3 p-4 pt-0">
                <div>
                  <Label>{PRODUCT_VI.rawIngredient}</Label>
                  <Combobox
                    options={ingredientOptions}
                    value={
                      line.ingredientId !== null
                        ? String(line.ingredientId)
                        : ""
                    }
                    onValueChange={(v) => handleIngredientChange(line.uid, v)}
                    placeholder={messages.inventory.waste.chooseIngredient}
                    size={embedded ? "touch" : "default"}
                    className="w-full"
                  />
                </div>

                {lineIssueUnits.length > 0 ? (
                  <div>
                    <Label htmlFor={`unit-${line.uid}`}>{FORM_VI.unit}</Label>
                    <Select
                      value={line.entryUnitId}
                      onValueChange={(v) => {
                        const opt = lineIssueUnits.find(
                          (u) => String(u.unitId) === v,
                        );
                        updateLine(line.uid, {
                          entryUnitId: v,
                          unit: opt?.label ?? line.unit,
                        });
                      }}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger
                        id={`unit-${line.uid}`}
                        size={embedded ? "touch" : "default"}
                        className="w-full"
                      >
                        <SelectValue
                          placeholder={messages.inventory.transfer.selectUnit}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {lineIssueUnits.map((u) => (
                          <SelectItem key={u.unitId} value={String(u.unitId)}>
                            {u.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

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
                    <Label htmlFor={`qty-${line.uid}`}>
                      {FORM_VI.quantity}
                    </Label>
                    <FormattedNumberInput
                      id={`qty-${line.uid}`}
                      maxFractionDigits={3}
                      value={line.quantity}
                      onValueChange={(value) =>
                        updateLine(line.uid, { quantity: value })
                      }
                      disabled={isSubmitting}
                      placeholder="0"
                      className={embedded ? "h-12" : undefined}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cost-${line.uid}`}>
                      {messages.inventory.waste.unitCostLabel(line.unit)}
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
                      className={embedded ? "h-12" : undefined}
                    />
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {messages.inventory.waste.value(formatVND(value))}
                    </p>
                  </div>
                </div>

                <div>
                  <Label htmlFor={`reason-${line.uid}`}>{FORM_VI.reason}</Label>
                  <WasteReasonDropdown
                    id={`reason-${line.uid}`}
                    value={line.reasonCode as never}
                    onChange={(v) => updateLine(line.uid, { reasonCode: v })}
                    disabled={isSubmitting}
                    size={embedded ? "touch" : "default"}
                    className="w-full"
                  />
                </div>

                {preview.photoRequired ? (
                  <div>
                    <Label>
                      {messages.inventory.waste.proofPhotoLabel(preview.tier)}
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
                  <Label htmlFor={`note-${line.uid}`}>
                    {messages.inventory.waste.lineNotes}
                  </Label>
                  <Textarea
                    id={`note-${line.uid}`}
                    value={line.note}
                    onChange={(e) =>
                      updateLine(line.uid, { note: e.target.value })
                    }
                    disabled={isSubmitting}
                    rows={2}
                  />
                </div>
              </div>
            </Item>
          );
        })}
      </ItemGroup>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size={embedded ? "touch" : "default"}
          onClick={addLine}
          disabled={isSubmitting}
          className="w-full sm:w-auto"
        >
          {messages.inventory.waste.addLine}
        </Button>
        <div
          className={cn(
            "text-sm font-medium tabular-nums",
            totalValue >= 500_000 ? "text-destructive" : "",
          )}
        >
          {messages.inventory.waste.total(formatVND(totalValue))}
        </div>
      </div>

      <AppDetailFooter
        sticky={embedded}
        className={embedded ? undefined : "border-0 py-0"}
        leading={
          <Button
            variant="outline"
            size={embedded ? "touch" : "default"}
            onClick={() => router.push(cancelHref ?? "/inventory/issues")}
            disabled={isSubmitting}
          >
            {ACTIONS_VI.cancel}
          </Button>
        }
        trailing={
          <Button
            size={embedded ? "touch-lg" : "default"}
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Spinner /> : messages.inventory.waste.createSlip}
          </Button>
        }
      />
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return (
    <DocumentFormFrame header={header} width="wide" density="compact">
      {content}
    </DocumentFormFrame>
  );
}
