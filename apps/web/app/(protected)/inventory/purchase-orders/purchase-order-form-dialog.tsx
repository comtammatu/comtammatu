"use client";

import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Item } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
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
import type { PurchaseRequestIngredientOption } from "@lib/inventory/purchase-request-model";
import type { PurchaseOrderSupplier } from "@lib/inventory/purchase-order-drafts";
import { messages } from "@lib/messages";
import type { RequestDraftLine } from "../purchase-requests/purchase-request-draft-types";

const copy = messages.inventory.po;

export function PurchaseOrderFormDialog({
  open,
  supplierId,
  branchId,
  neededBy,
  lines,
  suppliers,
  branches,
  ingredients,
  isPending,
  onOpenChange,
  onSupplierIdChange,
  onBranchIdChange,
  onNeededByChange,
  onChooseIngredient,
  onPatchLine,
  onRemoveLine,
  onAddLine,
  onClose,
  onSaveDraft,
  onSend,
}: {
  open: boolean;
  supplierId: string;
  branchId: string;
  neededBy: string;
  lines: RequestDraftLine[];
  suppliers: PurchaseOrderSupplier[];
  branches: Array<{ id: number; name: string }>;
  ingredients: PurchaseRequestIngredientOption[];
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSupplierIdChange: (value: string) => void;
  onBranchIdChange: (value: string) => void;
  onNeededByChange: (value: string) => void;
  onChooseIngredient: (line: RequestDraftLine, value: string) => void;
  onPatchLine: (key: string, patch: Partial<RequestDraftLine>) => void;
  onRemoveLine: (key: string) => void;
  onAddLine: () => void;
  onClose: () => void;
  onSaveDraft: () => void;
  onSend: () => void;
}) {
  const hasSupplier = supplierId !== "";
  const selectedSupplier = suppliers.find(
    (supplier) => String(supplier.id) === supplierId,
  );
  const mappedIngredientIds = new Set(selectedSupplier?.ingredientIds ?? []);
  const supplierIngredients = ingredients.filter((ingredient) =>
    mappedIngredientIds.has(ingredient.id),
  );
  const ingredientOptions = supplierIngredients.map((ingredient) => ({
    value: String(ingredient.id),
    label: ingredient.name,
  }));
  const canEditLines = hasSupplier && supplierIngredients.length > 0;
  const canSubmit = hasSupplier && !isPending;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      variant="document"
      title={copy.createTitle}
      description={copy.createDescription}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>
            {ACTIONS_VI.cancel}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={!canSubmit}
            onClick={onSaveDraft}
          >
            {copy.saveDraft}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={onSend}>
            {copy.sendAction}
          </Button>
        </>
      }
    >
      {open ? (
        <>
          <div className="sm:max-w-xl">
            <Select value={supplierId} onValueChange={onSupplierIdChange}>
              <SelectTrigger
                size="field"
                className="w-full"
                aria-label={copy.supplierRequired}
              >
                <SelectValue placeholder={copy.supplierRequired} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={String(supplier.id)}>
                    {supplier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {!hasSupplier ? (
            <p className="text-sm text-muted-foreground">
              {copy.selectSupplierFirst}
            </p>
          ) : null}
          <div
            className={
              hasSupplier
                ? "flex flex-col gap-3"
                : "flex flex-col gap-3 pointer-events-none opacity-50"
            }
            aria-disabled={!hasSupplier}
            data-locked={!hasSupplier ? "true" : undefined}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                value={branchId}
                onValueChange={onBranchIdChange}
                disabled={!hasSupplier}
              >
                <SelectTrigger
                  size="field"
                  className="w-full"
                  aria-label={copy.warehouse}
                >
                  <SelectValue placeholder={copy.warehouse} />
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
                disabled={!hasSupplier}
                aria-label={copy.expectedDeliveryDate}
              />
            </div>
            {hasSupplier && supplierIngredients.length === 0 ? (
              <p className="text-sm text-warning-foreground">
                {copy.noMappedIngredients}
              </p>
            ) : null}
            <div className="flex flex-col gap-2">
              <ScrollArea className="h-80">
                <div className="flex flex-col gap-2 pr-2">
                  {lines.map((line) => {
                    const ingredient = supplierIngredients.find(
                      (item) => item.id === Number(line.ingredientId),
                    );
                    return (
                      <Item
                        key={line.key}
                        variant="outline"
                        size="sm"
                        className="grid gap-2 sm:flex sm:items-center"
                      >
                        <div className="min-w-0 sm:flex-1">
                          <Combobox
                            size="field"
                            value={line.ingredientId}
                            onValueChange={(value) =>
                              onChooseIngredient(line, value)
                            }
                            options={ingredientOptions}
                            placeholder={copy.ingredient}
                            searchPlaceholder={copy.ingredientSearch}
                            disabled={!canEditLines}
                          />
                        </div>
                        <div className="sm:w-32">
                          <QuantityInput
                            controlSize="field"
                            value={line.quantity}
                            onValueChange={(value) =>
                              onPatchLine(line.key, { quantity: value })
                            }
                            maxFractionDigits={3}
                            placeholder={copy.quantity}
                            aria-label={copy.quantity}
                            disabled={!canEditLines}
                          />
                        </div>
                        <div className="sm:w-40">
                          <Select
                            value={line.entryUnitId}
                            onValueChange={(value) =>
                              onPatchLine(line.key, { entryUnitId: value })
                            }
                            disabled={!canEditLines}
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
                                <SelectItem
                                  key={unit.id}
                                  value={String(unit.id)}
                                >
                                  {unit.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          disabled={!canEditLines || lines.length === 1}
                          onClick={() => onRemoveLine(line.key)}
                          aria-label={ACTIONS_VI.remove}
                        >
                          <IconTrash />
                        </Button>
                      </Item>
                    );
                  })}
                </div>
              </ScrollArea>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                disabled={!canEditLines}
                onClick={onAddLine}
              >
                <IconPlus data-icon="inline-start" />
                {copy.addLine}
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </AppDialog>
  );
}
