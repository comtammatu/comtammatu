"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
} from "@comtammatu/ui/components/input-group";
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
import { Combobox } from "@/components/form/combobox";
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import { ItemGroup } from "@comtammatu/ui/components/item";
import { Frame } from "@comtammatu/ui/components/frame";
import { WasteReasonDropdown } from "@/(protected)/inventory/_components/waste-reason-dropdown";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { WastePhotoUpload } from "@/(protected)/inventory/_components/waste-photo-upload";
import { ShiftCapMeter } from "@/(protected)/inventory/_components/shift-cap-meter";
import { BranchDailyCapBanner } from "@/(protected)/inventory/_components/branch-daily-cap-banner";
import { AntiSplitRollingMeter } from "@/(protected)/inventory/_components/anti-split-rolling-meter";
import { createWasteEntry } from "@/(protected)/inventory/waste-actions";
import { formatQty } from "@lib/inventory/format";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
} from "@/(protected)/inventory/_lib/issue-units";
import { formatVND } from "@comtammatu/shared/format";
import { messages } from "@lib/messages";
import {
  newWasteLine,
  previewWasteTier,
  type WasteFormContext,
  type WasteLineState,
  type WasteRollingStatus,
} from "@lib/inventory/waste-create-model";
import {
  AppDetailFooter,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { ACTIONS_VI, FORM_VI, PRODUCT_VI } from "@comtammatu/shared/messages";

const toastSelectLocation = "Chọn location";
const toastSelectIngredientForEachLine = "Chọn nguyên liệu cho mỗi dòng";
const toastInvalidIngredient = "Nguyên liệu không hợp lệ";
const toastSelectReasonForEachLine = "Chọn lý do cho mỗi dòng";
const toastQtyPositive = "Số lượng phải > 0";
const toastNoWacForLocation = "Chưa có WAG cho nguyên liệu tại vị trí kho này";
const toastSelectUnitForEachLine = "Chọn đơn vị cho mỗi dòng";
const toastQtyExceedsStock = "Số lượng vượt tồn hiện tại.";
const toastCreateFailed = "Không tạo được phiếu hủy";
const toastPhotoRequired = (ingredientName: string, tier: number) =>
  `Dòng "${ingredientName}" cần ảnh (tier ${tier})`;
const toastCreateSuccess = (
  issueNumber: string,
  itemsCreated: number,
  requiresApproval: boolean,
) =>
  `Đã tạo phiếu ${issueNumber} (${itemsCreated} dòng)${requiresApproval ? " • Chờ QLV duyệt" : ""}`;
const labelNoWac = "Chưa có WAG";
const labelLocationStock = (qty: string, unit: string) =>
  `Tồn vị trí: ${qty} ${unit}`;

export function WasteCreateClient({ context }: { context: WasteFormContext }) {
  const router = useRouter();
  const nextLineId = useRef(1);
  const [locationId, setLocationId] = useState<number | null>(
    context.locations[0]?.id ?? null,
  );
  const [formNotes, setFormNotes] = useState("");
  const [lines, setLines] = useState<WasteLineState[]>(() => [
    newWasteLine("line-0"),
  ]);
  const [rollingByLine, setRollingByLine] = useState<
    Record<string, WasteRollingStatus | undefined>
  >({});
  const [forcePhotoLineUids, setForcePhotoLineUids] = useState<Set<string>>(
    () => new Set(),
  );
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
    const ingredient =
      l.ingredientId === null ? null : ingredientById.get(l.ingredientId);
    const unit = ingredient?.issueUnits.find(
      (u) => String(u.unitId) === l.entryUnitId,
    );
    const q = getIssueBaseQuantity(Number(l.quantity) || 0, unit);
    const c = Number(l.unitCost) || 0;
    return sum + q * c;
  }, 0);

  const projectedShiftSum = context.capStatus.shiftSum + totalValue;
  const projectedBranchSum = context.capStatus.branchToday + totalValue;

  function updateLine(uid: string, patch: Partial<WasteLineState>) {
    setLines((prev) =>
      prev.map((l) => (l.uid === uid ? { ...l, ...patch } : l)),
    );
  }

  const handleRollingStatusChange = useCallback(
    (uid: string, status: WasteRollingStatus | null) => {
      setRollingByLine((prev) => {
        if (status === null) {
          if (!prev[uid]) return prev;
          const next = { ...prev };
          delete next[uid];
          return next;
        }
        return { ...prev, [uid]: status };
      });
    },
    [],
  );

  function getLineBaseQuantity(
    line: WasteLineState,
    ingredient: WasteFormContext["ingredients"][number] | null | undefined,
  ) {
    const issueUnit = ingredient?.issueUnits.find(
      (u) => String(u.unitId) === line.entryUnitId,
    );
    return getIssueBaseQuantity(Number(line.quantity) || 0, issueUnit);
  }

  function getLineValue(
    line: WasteLineState,
    ingredient: WasteFormContext["ingredients"][number] | null | undefined,
  ) {
    return getLineBaseQuantity(line, ingredient) * (Number(line.unitCost) || 0);
  }

  function getPendingIngredientValue(ingredientId: number) {
    return lines.reduce((sum, line) => {
      if (line.ingredientId !== ingredientId) return sum;
      return sum + getLineValue(line, ingredientById.get(ingredientId));
    }, 0);
  }

  function revealPhotoUploadForCurrentLines() {
    setForcePhotoLineUids(new Set(lines.map((line) => line.uid)));
  }

  function resolveLocationStock(
    ingredient: WasteFormContext["ingredients"][number],
    nextLocationId: number | null,
  ) {
    return nextLocationId === null
      ? null
      : (ingredient.stockLevels.find(
          (level) => level.locationId === nextLocationId,
        ) ?? null);
  }

  function resolveLocationUnitCost(
    ingredient: WasteFormContext["ingredients"][number],
    nextLocationId: number | null,
  ) {
    return resolveLocationStock(ingredient, nextLocationId)?.unitCost ?? null;
  }

  function handleLocationChange(value: string) {
    const nextLocationId = Number(value);
    setLocationId(nextLocationId);
    setLines((prev) =>
      prev.map((line) => {
        const ingredient =
          line.ingredientId === null
            ? null
            : ingredientById.get(line.ingredientId);
        if (!ingredient) return line;
        const unitCost = resolveLocationUnitCost(ingredient, nextLocationId);
        const issueUnit = ingredient.issueUnits.find(
          (u) => String(u.unitId) === line.entryUnitId,
        );
        const locationStock = resolveLocationStock(ingredient, nextLocationId);
        const maxEntryQuantity = getIssueMaxEntryQuantity(
          locationStock?.quantity ?? 0,
          issueUnit,
        );
        return {
          ...line,
          quantity: clampIssueEntryQuantity(line.quantity, maxEntryQuantity),
          unitCost: unitCost === null ? "" : String(unitCost),
        };
      }),
    );
  }

  function removeLine(uid: string) {
    setLines((prev) =>
      prev.length <= 1 ? prev : prev.filter((l) => l.uid !== uid),
    );
    setForcePhotoLineUids((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }

  function addLine() {
    const uid = `line-${nextLineId.current}`;
    nextLineId.current += 1;
    setLines((prev) => [...prev, newWasteLine(uid)]);
  }

  function handleIngredientChange(uid: string, value: string) {
    const id = Number(value);
    const ing = ingredientById.get(id);
    if (!ing) return;
    const defaultUnit =
      ing.issueUnits.find((u) => u.isBase) ?? ing.issueUnits[0] ?? null;
    const unitCost = resolveLocationUnitCost(ing, locationId);
    const locationStock = resolveLocationStock(ing, locationId);
    const maxEntryQuantity = getIssueMaxEntryQuantity(
      locationStock?.quantity ?? 0,
      defaultUnit,
    );
    setLines((prev) =>
      prev.map((line) =>
        line.uid === uid
          ? {
              ...line,
              ingredientId: id,
              unit: defaultUnit?.label ?? ing.unit,
              entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
              quantity: clampIssueEntryQuantity(
                line.quantity,
                maxEntryQuantity,
              ),
              unitCost: unitCost !== null ? String(unitCost) : "",
            }
          : line,
      ),
    );
  }

  function handleSubmit() {
    if (locationId === null) {
      toast.error(toastSelectLocation);
      return;
    }
    // Validate each line
    for (const l of lines) {
      if (l.ingredientId === null) {
        toast.error(toastSelectIngredientForEachLine);
        return;
      }
      const ingredient = ingredientById.get(l.ingredientId);
      if (!ingredient) {
        toast.error(toastInvalidIngredient);
        return;
      }
      if (!l.reasonCode) {
        toast.error(toastSelectReasonForEachLine);
        return;
      }
      const qty = Number(l.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        toast.error(toastQtyPositive);
        return;
      }
      const cost = Number(l.unitCost);
      if (!Number.isFinite(cost) || cost <= 0) {
        toast.error(toastNoWacForLocation);
        return;
      }
      const issueUnit = ingredient.issueUnits.find(
        (u) => String(u.unitId) === l.entryUnitId,
      );
      if (!issueUnit) {
        toast.error(toastSelectUnitForEachLine);
        return;
      }
      const baseQty = getIssueBaseQuantity(qty, issueUnit);
      const locationStock = resolveLocationStock(ingredient, locationId);
      const availableQuantity = Number(locationStock?.quantity ?? 0);
      if (baseQty > availableQuantity + 1e-9) {
        toast.error(toastQtyExceedsStock);
        return;
      }
      // Preview tier — if photo required but none attached, block
      const value = baseQty * cost;
      const pv = previewWasteTier({
        value,
        baseQuantity: baseQty,
        availableQuantity,
        reasonCode: l.reasonCode,
        projectedShiftSum,
        projectedBranchSum,
        branchCap: context.capStatus.branchCap,
        rollingSum: rollingByLine[l.uid]?.rollingSum ?? null,
        pendingIngredientValue: getPendingIngredientValue(l.ingredientId),
      });
      if (pv.photoRequired && l.photoUrls.length === 0) {
        toast.error(
          toastPhotoRequired(
            ingredientById.get(l.ingredientId!)?.name ?? String(l.ingredientId),
            pv.tier,
          ),
        );
        return;
      }
    }

    startSubmit(async () => {
      try {
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
          if (res.error?.includes("bằng chứng") || res.error?.includes("ảnh")) {
            revealPhotoUploadForCurrentLines();
          }
          toast.error(res.error ?? toastCreateFailed);
          return;
        }
        toast.success(
          toastCreateSuccess(
            res.data?.issueNumber ?? "",
            res.data?.itemsCreated ?? 0,
            res.data?.requiresApproval ?? false,
          ),
        );
        router.push(`/inventory/issues/${res.data?.issueId}`);
      } catch (error) {
        console.error("inventory.waste.create_failed", error);
        toast.error(toastCreateFailed);
      }
    });
  }

  const header = (
    <AppPageHeader
      eyebrow={messages.inventory.shell.moduleName}
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
            onValueChange={handleLocationChange}
            disabled={isSubmitting}
          >
            <SelectTrigger id="waste-loc" size="default" className="w-full">
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
          const selectedIngredient =
            line.ingredientId !== null
              ? ingredientById.get(line.ingredientId)
              : null;
          const selectedUnit = selectedIngredient?.issueUnits.find(
            (u) => String(u.unitId) === line.entryUnitId,
          );
          const baseQty = getIssueBaseQuantity(qty, selectedUnit);
          const value = baseQty * cost;
          const locationStock = selectedIngredient
            ? resolveLocationStock(selectedIngredient, locationId)
            : null;
          const availableQuantity = Number(locationStock?.quantity ?? 0);
          const maxEntryQuantity = getIssueMaxEntryQuantity(
            availableQuantity,
            selectedUnit,
          );
          const maxQuantityValue =
            formatIssueMaxEntryQuantity(maxEntryQuantity);
          const lineIssueUnits = selectedIngredient?.issueUnits ?? [];
          const preview = previewWasteTier({
            value,
            baseQuantity: baseQty,
            availableQuantity,
            reasonCode: line.reasonCode,
            projectedShiftSum,
            projectedBranchSum,
            branchCap: context.capStatus.branchCap,
            rollingSum: rollingByLine[line.uid]?.rollingSum ?? null,
            pendingIngredientValue:
              line.ingredientId === null
                ? value
                : getPendingIngredientValue(line.ingredientId),
          });
          const showPhotoUpload =
            preview.photoRequired ||
            forcePhotoLineUids.has(line.uid) ||
            line.photoUrls.length > 0;
          return (
            <Frame key={line.uid} className="flex flex-col items-stretch">
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
                        size="icon"
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
                    size="sm"
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
                        const nextMaxEntryQuantity = getIssueMaxEntryQuantity(
                          locationStock?.quantity ?? 0,
                          opt,
                        );
                        updateLine(line.uid, {
                          entryUnitId: v,
                          unit: opt?.label ?? line.unit,
                          quantity: clampIssueEntryQuantity(
                            line.quantity,
                            nextMaxEntryQuantity,
                          ),
                        });
                      }}
                      disabled={isSubmitting}
                    >
                      <SelectTrigger
                        id={`unit-${line.uid}`}
                        size="sm"
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
                  onStatusChange={(status) =>
                    handleRollingStatusChange(line.uid, status)
                  }
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`qty-${line.uid}`}>
                      {FORM_VI.quantity}
                    </Label>
                    <InputGroup>
                      <FormattedNumberInput
                        id={`qty-${line.uid}`}
                        maxFractionDigits={3}
                        value={line.quantity}
                        onValueChange={(value) =>
                          updateLine(line.uid, {
                            quantity: clampIssueEntryQuantity(
                              value,
                              maxEntryQuantity,
                            ),
                          })
                        }
                        disabled={isSubmitting}
                        placeholder="0"
                        className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
                      />
                      {maxQuantityValue ? (
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            type="button"
                            onClick={() =>
                              updateLine(line.uid, {
                                quantity: maxQuantityValue,
                              })
                            }
                            disabled={isSubmitting}
                          >
                            {FORM_VI.max}
                          </InputGroupButton>
                        </InputGroupAddon>
                      ) : null}
                    </InputGroup>
                  </div>
                  <div>
                    <Label htmlFor={`cost-${line.uid}`}>
                      {messages.inventory.waste.unitCostLabel(
                        selectedIngredient?.unit ?? line.unit,
                      )}
                    </Label>
                    <div
                      id={`cost-${line.uid}`}
                      className="flex h-10 items-center bg-muted/30 px-3 font-mono text-sm tabular-nums"
                    >
                      {cost > 0 ? formatVND(cost) : labelNoWac}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                      {messages.inventory.waste.value(formatVND(value))}
                    </p>
                    {locationStock ? (
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {labelLocationStock(
                          formatQty(locationStock.quantity),
                          selectedIngredient?.unit ?? line.unit,
                        )}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <Label htmlFor={`reason-${line.uid}`}>{FORM_VI.reason}</Label>
                  <WasteReasonDropdown
                    id={`reason-${line.uid}`}
                    value={line.reasonCode as never}
                    onChange={(v) => updateLine(line.uid, { reasonCode: v })}
                    disabled={isSubmitting}
                    size="sm"
                    className="w-full"
                  />
                </div>

                {showPhotoUpload ? (
                  <div>
                    <Label>
                      {messages.inventory.waste.proofPhotoLabel(
                        preview.tier === 0 ? 1 : preview.tier,
                      )}
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
            </Frame>
          );
        })}
      </ItemGroup>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="outline"
          size="default"
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
        className="border-0 py-0"
        leading={
          <Button
            variant="outline"
            size="default"
            onClick={() => router.push("/inventory/issues")}
            disabled={isSubmitting}
          >
            {ACTIONS_VI.cancel}
          </Button>
        }
        trailing={
          <Button size="default" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Spinner /> : messages.inventory.waste.createSlip}
          </Button>
        }
      />
    </>
  );

  return (
    <DocumentFormFrame header={header} width="wide" density="compact">
      {content}
    </DocumentFormFrame>
  );
}
