"use client";

import { Trash as IconTrash, Plus as IconPlus } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  AppDialog,
  BusinessDatePicker,
  Combobox,
  QuantityInput,
} from "@/components/form";
import {
  type PurchaseRequestIngredientOption,
  type PurchaseRequestRow,
} from "@lib/inventory/purchase-request-model";
import { messages } from "@lib/messages";
import type { RequestDraftLine } from "./purchase-request-draft-types";

const copy = messages.inventory.purchaseRequests;

export function PurchaseRequestFormDialog({
  open,
  mode,
  selected,
  copyFromRequestId,
  editingPendingDemand,
  branchId,
  neededBy,
  requestLines,
  branches,
  ingredients,
  ingredientOptions,
  mappedIngredientIds,
  isPending,
  onOpenChange,
  onBranchIdChange,
  onNeededByChange,
  onChooseIngredient,
  onPatchRequestLine,
  onRemoveLine,
  onAddLine,
  onClose,
  onSaveDraft,
  onSaveSubmit,
}: {
  open: boolean;
  mode: string | null;
  selected: PurchaseRequestRow | null;
  copyFromRequestId: number | null;
  editingPendingDemand: boolean;
  branchId: string;
  neededBy: string;
  requestLines: RequestDraftLine[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  ingredientOptions: Array<{ value: string; label: string }>;
  mappedIngredientIds: number[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onBranchIdChange: (value: string) => void;
  onNeededByChange: (value: string) => void;
  onChooseIngredient: (line: RequestDraftLine, value: string) => void;
  onPatchRequestLine: (key: string, patch: Partial<RequestDraftLine>) => void;
  onRemoveLine: (key: string) => void;
  onAddLine: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onSaveSubmit: () => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="document"
      title={
        mode === "edit" && selected
          ? selected.code
          : copyFromRequestId != null
            ? copy.copyToNewAction
            : copy.createTitle
      }
      description={
        mode === "edit" && selected
          ? copy.statusLabel(selected.status)
          : copyFromRequestId != null
            ? copy.copyToNewBanner
            : copy.description
      }
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {ACTIONS_VI.cancel}
          </Button>
          {editingPendingDemand ? (
            <Button type="button" disabled={isPending} onClick={onSaveSubmit}>
              {ACTIONS_VI.saveChanges}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={onSaveDraft}
              >
                {copy.saveDraft}
              </Button>
              <Button type="button" disabled={isPending} onClick={onSaveSubmit}>
                {copy.submitAction}
              </Button>
            </>
          )}
        </>
      }
    >
      {open ? (
        <>
          {copyFromRequestId != null ? (
            <Item variant="muted" size="sm">
              {copy.copyToNewBanner}
            </Item>
          ) : null}
          {selected?.status === "changes_requested" && selected.statusReason ? (
            <Item variant="muted" size="sm">
              <span className="font-medium">{copy.returnedReasonLabel}</span>{" "}
              {selected.statusReason}
            </Item>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={branchId} onValueChange={onBranchIdChange}>
              <SelectTrigger
                size="field"
                className="w-full"
                aria-label={copy.branchRequired}
              >
                <SelectValue placeholder={copy.branchRequired} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <BusinessDatePicker
              value={neededBy}
              onValueChange={onNeededByChange}
              aria-label={copy.neededBy}
            />
          </div>
          <div className="flex flex-col gap-2">
            {requestLines.map((line) => {
              const ingredient = ingredients.find(
                (item) => item.id === Number(line.ingredientId),
              );
              const hasSupplier = mappedIngredientIds.includes(
                Number(line.ingredientId),
              );
              return (
                <Item
                  key={line.key}
                  variant="outline"
                  size="sm"
                  className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_8rem_10rem_auto]"
                >
                  <div className="min-w-0">
                    <Combobox
                      size="field"
                      value={line.ingredientId}
                      onValueChange={(value) => onChooseIngredient(line, value)}
                      options={ingredientOptions}
                      placeholder={copy.ingredient}
                      searchPlaceholder={copy.searchPlaceholder}
                    />
                    {line.ingredientId && !hasSupplier ? (
                      <span className="mt-1 block text-xs text-warning-foreground">
                        {copy.missingSupplierShort}
                      </span>
                    ) : null}
                  </div>
                  <QuantityInput
                    controlSize="field"
                    value={line.quantity}
                    onValueChange={(value) =>
                      onPatchRequestLine(line.key, { quantity: value })
                    }
                    maxFractionDigits={3}
                    placeholder={copy.quantity}
                    aria-label={copy.quantity}
                  />
                  <Select
                    value={line.entryUnitId}
                    onValueChange={(value) =>
                      onPatchRequestLine(line.key, { entryUnitId: value })
                    }
                  >
                    <SelectTrigger
                      size="field"
                      className="w-full"
                      aria-label={copy.unit}
                    >
                      <SelectValue placeholder={copy.unit} />
                    </SelectTrigger>
                    <SelectContent>
                      {(ingredient?.units ?? []).map((unit) => (
                        <SelectItem key={unit.id} value={String(unit.id)}>
                          {unit.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    disabled={requestLines.length === 1}
                    onClick={() => onRemoveLine(line.key)}
                    aria-label={ACTIONS_VI.delete}
                  >
                    <IconTrash />
                  </Button>
                </Item>
              );
            })}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              onClick={onAddLine}
            >
              <IconPlus data-icon="inline-start" />
              {copy.addLine}
            </Button>
          </div>
        </>
      ) : null}
    </AppDialog>
  );
}
