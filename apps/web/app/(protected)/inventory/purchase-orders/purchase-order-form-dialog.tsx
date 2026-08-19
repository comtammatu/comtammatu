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
  const selectedSupplier = suppliers.find(
    (supplier) => String(supplier.id) === supplierId,
  );
  const ingredientOptions = ingredients.map((ingredient) => ({
    value: String(ingredient.id),
    label: ingredient.name,
  }));

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
            disabled={isPending}
            onClick={onSaveDraft}
          >
            {copy.saveDraft}
          </Button>
          <Button type="button" disabled={isPending} onClick={onSend}>
            {copy.sendAction}
          </Button>
        </>
      }
    >
      {open ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <Select value={branchId} onValueChange={onBranchIdChange}>
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
              aria-label={copy.expectedDeliveryDate}
            />
          </div>
          <div className="flex flex-col gap-2">
            <ScrollArea className="h-80">
              <div className="flex flex-col gap-2 pr-2">
                {lines.map((line) => {
                  const ingredient = ingredients.find(
                    (item) => item.id === Number(line.ingredientId),
                  );
                  const mapped =
                    line.ingredientId === "" ||
                    selectedSupplier?.ingredientIds.includes(
                      Number(line.ingredientId),
                    ) === true;
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
                        />
                        {line.ingredientId && !mapped ? (
                          <span className="mt-1 block text-xs text-warning-foreground">
                            {copy.unmappedLineWarning}
                          </span>
                        ) : null}
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
                        />
                      </div>
                      <div className="sm:w-40">
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(value) =>
                            onPatchLine(line.key, { entryUnitId: value })
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
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-lg"
                        disabled={lines.length === 1}
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
