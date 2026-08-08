"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Plus as IconPlus, Trash2 as IconTrash } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Item } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { Combobox, QuantityInput } from "@/components/form";
import { AppDetailFooter, AppSection } from "@/components/surface";
import { WastePhotoUpload } from "@/(protected)/inventory/_components/waste-photo-upload";
import { WasteReasonDropdown } from "@/(protected)/inventory/_components/waste-reason-dropdown";
import { createWasteEntry } from "@/(protected)/inventory/waste-actions";
import {
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
} from "@/(protected)/inventory/_lib/issue-units";
import {
  newWasteLine,
  type WasteFormContext,
  type WasteLineState,
} from "@lib/inventory/waste-create-model";
import { formatQty } from "@lib/inventory/format";
import {
  applyInventoryActionError,
  inventoryShortageToastMessage,
} from "@lib/inventory/apply-inventory-action-error";
import { INVENTORY_ERROR_CODES } from "@lib/messages/inventory-rpc-errors";
import { cn } from "@comtammatu/ui";

export function WasteOperationalForm({
  context,
  cancelHref,
  onCreated,
}: {
  context: WasteFormContext;
  cancelHref: string;
  onCreated: (issueId: number) => void;
}) {
  const copy = messages.inventory.waste.operational;
  const nextLineId = useRef(1);
  const [locationId, setLocationId] = useState<number | null>(
    context.locations[0]?.id ?? null,
  );
  const [lines, setLines] = useState<WasteLineState[]>([
    newWasteLine("line-0"),
  ]);
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [shortageIngredientId, setShortageIngredientId] = useState<
    number | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const ingredientById = useMemo(
    () => new Map(context.ingredients.map((item) => [item.id, item])),
    [context.ingredients],
  );
  // Sites keep one active warehouse (docs/ref/inventory.md) — only prompt when
  // more than one stock-bearing location is actually available.
  const showLocationPicker = context.locations.length > 1;

  function patchLine(uid: string, patch: Partial<WasteLineState>) {
    setLines((current) =>
      current.map((line) => (line.uid === uid ? { ...line, ...patch } : line)),
    );
  }

  function selectIngredient(uid: string, value: string) {
    const ingredient = ingredientById.get(Number(value));
    const defaultUnit = ingredient?.issueUnits[0];
    patchLine(uid, {
      ingredientId: ingredient?.id ?? null,
      entryUnitId: defaultUnit ? String(defaultUnit.unitId) : "",
      unit: defaultUnit?.label ?? ingredient?.unit ?? "",
    });
  }

  function addLine() {
    setLines((current) => [
      ...current,
      newWasteLine(`line-${nextLineId.current++}`),
    ]);
  }

  function removeLine(uid: string) {
    setLines((current) =>
      current.length === 1
        ? [newWasteLine(`line-${nextLineId.current++}`)]
        : current.filter((line) => line.uid !== uid),
    );
  }

  function submit() {
    if (locationId == null) {
      toast.error(copy.noLocationAvailable);
      return;
    }

    for (const line of lines) {
      const ingredient =
        line.ingredientId == null
          ? null
          : ingredientById.get(line.ingredientId);
      const unit = ingredient?.issueUnits.find(
        (item) => String(item.unitId) === line.entryUnitId,
      );
      const quantity = Number(line.quantity);
      const stock = ingredient?.stockLevels.find(
        (item) => item.locationId === locationId,
      );
      if (!ingredient || !unit || !line.reasonCode) {
        toast.error("Hoàn tất nguyên liệu, đơn vị và lý do cho từng dòng.");
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error("Số lượng phải lớn hơn 0.");
        return;
      }
      if (
        getIssueBaseQuantity(quantity, unit) >
        Number(stock?.quantity ?? 0) + 1e-9
      ) {
        toast.error(`Số lượng ${ingredient.name} vượt tồn hiện tại.`);
        return;
      }
      if (evidenceRequired && line.photoUrls.length === 0) {
        toast.error("Thêm ảnh bằng chứng cho các dòng cần kiểm tra.");
        return;
      }
    }

    startTransition(async () => {
      const result = await createWasteEntry({
        branchId: context.branch.id,
        locationId,
        items: lines.map((line) => ({
          ingredient_id: line.ingredientId!,
          quantity: Number(line.quantity),
          entry_unit_id: Number(line.entryUnitId),
          reason_code: line.reasonCode as never,
          note: line.note || undefined,
          photo_urls: line.photoUrls,
        })),
        sourceType: "manual",
      });
      if (!result.success) {
        const applied = applyInventoryActionError(
          result,
          "Không tạo được phiếu hao hụt.",
        );
        if (applied.errorCode === INVENTORY_ERROR_CODES.WASTE_EVIDENCE_REQUIRED) {
          setEvidenceRequired(true);
        }
        const named =
          applied.lineTarget == null
            ? null
            : ingredientById.get(applied.lineTarget.ingredientId)?.name;
        setShortageIngredientId(applied.lineTarget?.ingredientId ?? null);
        toast.error(
          inventoryShortageToastMessage(
            applied,
            named,
            copy.shortageNamed,
          ),
        );
        return;
      }
      setShortageIngredientId(null);
      toast.success(
        result.data?.requiresApproval
          ? "Đã tạo phiếu, đang chờ duyệt."
          : "Đã ghi nhận phiếu hao hụt.",
      );
      onCreated(result.data?.issueId ?? 0);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {context.capStatus.requiresReview || evidenceRequired ? (
        <NoteCallout tone="warning">{copy.priceReviewHint}</NoteCallout>
      ) : null}

      {showLocationPicker ? (
        <Field>
          <FieldLabel>{copy.locationLabel}</FieldLabel>
          <Select
            value={locationId == null ? "" : String(locationId)}
            onValueChange={(value) => setLocationId(Number(value))}
          >
            <SelectTrigger size="touch">
              <SelectValue placeholder={copy.locationPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {context.locations.map((location) => (
                <SelectItem
                  key={location.id}
                  value={String(location.id)}
                  size="touch"
                >
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <AppSection
        title={copy.linesTitle}
        action={
          <Button type="button" variant="outline" onClick={addLine}>
            <IconPlus className="size-4" />
            {copy.addLine}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {lines.map((line, index) => {
            const ingredient =
              line.ingredientId == null
                ? null
                : ingredientById.get(line.ingredientId);
            const unit = ingredient?.issueUnits.find(
              (item) => String(item.unitId) === line.entryUnitId,
            );
            const stock = ingredient?.stockLevels.find(
              (item) => item.locationId === locationId,
            );
            const maxEntryQuantity = unit
              ? getIssueMaxEntryQuantity(Number(stock?.quantity ?? 0), unit)
              : 0;
            return (
              <Item
                key={line.uid}
                variant="outline"
                className={cn(
                  "grid gap-3 md:grid-cols-2",
                  shortageIngredientId != null &&
                    line.ingredientId === shortageIngredientId &&
                    "border-destructive",
                )}
                data-shortage={
                  shortageIngredientId != null &&
                  line.ingredientId === shortageIngredientId
                    ? "true"
                    : undefined
                }
              >
                <Field>
                  <FieldLabel>{copy.ingredientLabel(index + 1)}</FieldLabel>
                  <Combobox
                    value={
                      line.ingredientId == null ? "" : String(line.ingredientId)
                    }
                    onValueChange={(value) => selectIngredient(line.uid, value)}
                    options={context.ingredients.map((item) => ({
                      value: String(item.id),
                      label: item.name,
                    }))}
                    size="touch"
                  />
                </Field>
                <Field>
                  <FieldLabel>{copy.unitLabel}</FieldLabel>
                  <Select
                    value={line.entryUnitId}
                    onValueChange={(value) => {
                      const selected = ingredient?.issueUnits.find(
                        (item) => String(item.unitId) === value,
                      );
                      patchLine(line.uid, {
                        entryUnitId: value,
                        unit: selected?.label ?? "",
                      });
                    }}
                  >
                    <SelectTrigger size="touch">
                      <SelectValue placeholder={copy.unitPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {(ingredient?.issueUnits ?? []).map((item) => (
                        <SelectItem
                          key={item.unitId}
                          value={String(item.unitId)}
                          size="touch"
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>
                    {copy.quantityLabel}
                    {ingredient && unit
                      ? copy.stockHint(formatQty(maxEntryQuantity), unit.label)
                      : ""}
                  </FieldLabel>
                  <QuantityInput
                    value={line.quantity}
                    maxFractionDigits={3}
                    className={cn(
                      "h-12",
                      shortageIngredientId != null &&
                        line.ingredientId === shortageIngredientId &&
                        "border-destructive",
                    )}
                    aria-invalid={
                      shortageIngredientId != null &&
                      line.ingredientId === shortageIngredientId
                    }
                    onValueChange={(value) =>
                      patchLine(line.uid, { quantity: value })
                    }
                  />
                  {shortageIngredientId != null &&
                  line.ingredientId === shortageIngredientId ? (
                    <p className="text-xs text-destructive">
                      {copy.lineShortageHint}
                    </p>
                  ) : null}
                </Field>
                <Field>
                  <FieldLabel>{copy.reasonLabel}</FieldLabel>
                  <WasteReasonDropdown
                    value={line.reasonCode as never}
                    onChange={(value) =>
                      patchLine(line.uid, { reasonCode: value })
                    }
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>{copy.lineNotesLabel}</FieldLabel>
                  <Textarea
                    value={line.note}
                    onChange={(event) =>
                      patchLine(line.uid, { note: event.target.value })
                    }
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel>
                    {copy.evidenceLabel(evidenceRequired)}
                  </FieldLabel>
                  <WastePhotoUpload
                    tenantId={context.tenantId}
                    branchId={context.branch.id}
                    issueId={line.uid}
                    value={line.photoUrls[0] ?? null}
                    onChange={(url) =>
                      patchLine(line.uid, {
                        photoUrls: url ? [url] : [],
                      })
                    }
                    previewSize="touch"
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  className="justify-self-start text-destructive"
                  onClick={() => removeLine(line.uid)}
                >
                  <IconTrash className="size-4" />
                  {copy.removeLine}
                </Button>
              </Item>
            );
          })}
        </div>
      </AppSection>

      <AppDetailFooter
        sticky
        leading={
          <Button
            type="button"
            variant="outline"
            size="touch"
            render={<Link href={cancelHref} />}
          >
            {ACTIONS_VI.cancel}
          </Button>
        }
        trailing={
          <Button
            type="button"
            size="touch-lg"
            disabled={isPending}
            onClick={submit}
          >
            {isPending ? copy.submitting : copy.submit}
          </Button>
        }
      />
    </div>
  );
}
