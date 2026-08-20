"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus as IconPlus } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { getWasteReasonLabelVi } from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppEmptyState, AppDetailFooter } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { WasteTierBadge } from "@/(protected)/inventory/_components/waste-tier-badge";
import { createWasteEntry } from "@/(protected)/inventory/waste-actions";
import {
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
} from "@/(protected)/inventory/_lib/issue-units";
import { formatQty } from "@lib/inventory/format";
import {
  applyInventoryActionError,
  inventoryShortageToastMessage,
} from "@lib/inventory/apply-inventory-action-error";
import { INVENTORY_ERROR_CODES } from "@lib/messages/inventory-rpc-errors";
import {
  newWasteLine,
  previewWasteLineTierFromReason,
  type WasteFormContext,
  type WasteLineState,
} from "@lib/inventory/waste-create-model";
import { messages } from "@lib/messages";
import { cn } from "@comtammatu/ui";
import { WasteLineSheet } from "./_components/waste-line-sheet";

export function BranchWasteCreateClient({
  branchId,
  branchName,
  canCreateWaste,
  loadFailed,
  context,
}: {
  branchId: number;
  branchName: string;
  canCreateWaste: boolean;
  loadFailed: boolean;
  context: WasteFormContext | null;
}) {
  const router = useRouter();
  const copy = messages.inventory.waste.operational;
  const stockBasePath = `/br/${branchId}/stock`;
  const cancelHref = stockBasePath;
  const unavailable = loadFailed
    ? messages.inventory.waste.loadFailedTitle
    : copy.unavailable;

  const nextLineId = useRef(1);
  const [locationId, setLocationId] = useState<number | null>(
    context?.locations[0]?.id ?? null,
  );
  const [lines, setLines] = useState<WasteLineState[]>([
    newWasteLine("line-0"),
  ]);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [evidenceRequired, setEvidenceRequired] = useState(false);
  const [shortageIngredientId, setShortageIngredientId] = useState<
    number | null
  >(null);
  const [isPending, startTransition] = useTransition();

  const ingredientById = useMemo(
    () => new Map((context?.ingredients ?? []).map((item) => [item.id, item])),
    [context?.ingredients],
  );
  const showLocationPicker = (context?.locations.length ?? 0) > 1;
  const editingLine = lines.find((line) => line.uid === editingUid) ?? null;
  const editingIngredient =
    editingLine?.ingredientId == null
      ? null
      : ingredientById.get(editingLine.ingredientId);
  const editingUnit = editingIngredient?.issueUnits.find(
    (item) => String(item.unitId) === editingLine?.entryUnitId,
  );
  const editingStock = editingIngredient?.stockLevels.find(
    (item) => item.locationId === locationId,
  );
  const editingMaxQuantity = editingUnit
    ? getIssueMaxEntryQuantity(Number(editingStock?.quantity ?? 0), editingUnit)
    : 0;
  const editingStockHint =
    editingIngredient && editingUnit
      ? copy.stockHint(formatQty(editingMaxQuantity), editingUnit.label)
      : "";

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
    const uid = `line-${nextLineId.current++}`;
    setLines((current) => [...current, newWasteLine(uid)]);
    setEditingUid(uid);
  }

  function removeLine(uid: string) {
    setLines((current) =>
      current.length === 1
        ? [newWasteLine(`line-${nextLineId.current++}`)]
        : current.filter((line) => line.uid !== uid),
    );
    setEditingUid(null);
  }

  function submit() {
    if (!context) return;
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
        toast.error(copy.incompleteLine);
        return;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        toast.error(copy.quantityMustBePositive);
        return;
      }
      if (
        getIssueBaseQuantity(quantity, unit) >
        Number(stock?.quantity ?? 0) + 1e-9
      ) {
        toast.error(copy.quantityExceedsStock(ingredient.name));
        return;
      }
      if (evidenceRequired && line.photoUrls.length === 0) {
        toast.error(copy.evidenceRequiredToast);
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
        const applied = applyInventoryActionError(result, copy.createFailed);
        if (
          applied.errorCode === INVENTORY_ERROR_CODES.WASTE_EVIDENCE_REQUIRED
        ) {
          setEvidenceRequired(true);
        }
        const named =
          applied.lineTarget == null
            ? null
            : ingredientById.get(applied.lineTarget.ingredientId)?.name;
        setShortageIngredientId(applied.lineTarget?.ingredientId ?? null);
        toast.error(
          inventoryShortageToastMessage(applied, named, copy.shortageNamed),
        );
        return;
      }
      setShortageIngredientId(null);
      toast.success(
        result.data?.requiresApproval
          ? copy.createdPending
          : copy.createdRecorded,
      );
      router.push(`/br/${branchId}/stock/issues/${result.data?.issueId ?? 0}`);
    });
  }

  return (
    <BranchOperatorPage title={copy.title} description={branchName}>
      {!canCreateWaste || !context ? (
        <AppEmptyState compact title={unavailable} />
      ) : (
        <>
          <BranchOperatorPanel
            title={copy.panelTitle}
            description={copy.panelDescription}
            size="sm"
          >
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
              onClick={addLine}
            >
              <IconPlus className="size-4" />
              {copy.addLine}
            </Button>
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

            <ItemGroup>
              {lines.map((line) => {
                const ingredient =
                  line.ingredientId == null
                    ? null
                    : ingredientById.get(line.ingredientId);
                const quantity = Number(line.quantity);
                const hasQuantity = Number.isFinite(quantity) && quantity > 0;
                const tier = previewWasteLineTierFromReason(line.reasonCode);
                const isShortage =
                  shortageIngredientId != null &&
                  line.ingredientId === shortageIngredientId;
                return (
                  <Item
                    key={line.uid}
                    variant="outline"
                    size="sm"
                    render={<button type="button" />}
                    onClick={() => setEditingUid(line.uid)}
                    className={cn(isShortage && "border-destructive")}
                    data-shortage={isShortage ? "true" : undefined}
                  >
                    <ItemContent>
                      <ItemTitle>
                        {ingredient?.name ??
                          messages.inventory.waste.chooseIngredient}
                      </ItemTitle>
                      <ItemDescription>
                        {hasQuantity
                          ? `${formatQty(quantity)} ${line.unit}`
                          : copy.quantityPlaceholder}
                        {line.reasonCode
                          ? ` · ${getWasteReasonLabelVi(line.reasonCode)}`
                          : ""}
                        {` · ${copy.expectedValueHint}`}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <WasteTierBadge
                        compact
                        tier={tier.tier}
                        photoRequired={tier.photoRequired || evidenceRequired}
                        approvalRequired={tier.approvalRequired}
                      />
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          </BranchOperatorPanel>

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

          <WasteLineSheet
            line={editingLine}
            context={context}
            stockHint={editingStockHint}
            evidenceRequired={evidenceRequired}
            isShortage={
              shortageIngredientId != null &&
              editingLine?.ingredientId === shortageIngredientId
            }
            onClose={() => setEditingUid(null)}
            onPatch={(patch) => {
              if (editingUid) patchLine(editingUid, patch);
            }}
            onSelectIngredient={(value) => {
              if (editingUid) selectIngredient(editingUid, value);
            }}
            onRemove={() => {
              if (editingUid) removeLine(editingUid);
            }}
          />
        </>
      )}
    </BranchOperatorPage>
  );
}
