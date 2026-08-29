"use client";

import Link from "next/link";
import {
  PackageCheck as IconPackageCheck,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import {
  ACTIONS_VI,
  FORM_VI,
  INVENTORY_VI,
} from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemActions, ItemContent } from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { Combobox } from "@/components/form/combobox";
import { FormField } from "@/components/form/form-field";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import {
  AppEmptyState,
  AppSection,
} from "@/components/surface";
import type { TransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { TransferCreateRouteFields } from "@lib/inventory/transfer-create-route-fields";
import { getTransferWarehouseUnit } from "@lib/inventory/transfer-create-model";
import { useTransferCreateController } from "@lib/inventory/use-transfer-create-controller";
import type {
  TransferCreateDirection,
  TransferPrefillLine,
} from "@lib/inventory/use-transfer-create-controller";
import { messages } from "@lib/messages";

interface CreateTransferFormProps extends TransferCreatePageData {
  basePath?: string;
  initialDirection?: TransferCreateDirection;
  initialPrefillLine?: TransferPrefillLine;
}

export function CreateTransferForm({
  basePath = "/inventory/transfers",
  initialDirection,
  initialPrefillLine,
  ...data
}: CreateTransferFormProps) {
  const controller = useTransferCreateController({
    ...data,
    basePath,
    initialDirection,
    initialPrefillLine,
  });
  const copy = messages.inventory.transfer;
  const isTouchLayout = useIsMobile(1024);
  const controlSize = isTouchLayout ? "touch" : "field";
  const optionSize = isTouchLayout ? "touch" : "default";
  const actionSize = isTouchLayout ? "touch" : "default";
  const removeActionSize = isTouchLayout ? "icon-touch" : "icon-sm";

  return (
    <form onSubmit={controller.submit} className="flex min-w-0 flex-col gap-4">
      {controller.loadFailed ? (
        <AppEmptyState
          compact
          mode="error"
          title={copy.createDataLoadFailedTitle}
          description={copy.createDataLoadFailedDescription}
        />
      ) : null}
      <AppSection title={copy.createTransferTitle}>
        <TransferCreateRouteFields
          controller={controller}
          controlSize={controlSize}
          optionSize={optionSize}
        />
      </AppSection>

      <AppSection title={copy.ingredientsQtyRequired}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                value={controller.pickerIngredientId}
                onValueChange={controller.setPickerIngredientId}
                options={controller.activeIngredients.map((ingredient) => ({
                  value: String(ingredient.id),
                  label: `${ingredient.name} (${getTransferWarehouseUnit(
                    ingredient,
                  )})`,
                }))}
                id="owner-transfer-ingredient"
                size={controlSize}
                className="w-full"
                placeholder={copy.chooseIngredient}
                searchPlaceholder={INVENTORY_VI.searchByName}
                aria-label={copy.createNative.ingredientLabel}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size={controlSize}
              className="shrink-0"
              onClick={controller.addIngredientLine}
              disabled={!controller.pickerIngredientId}
              aria-label={copy.addIngredientAria}
            >
              <IconPlus />
            </Button>
          </div>
          {controller.isPull ? null : (
            <Button
              type="button"
              variant="outline"
              size={controlSize}
              className="w-full shrink-0 sm:w-auto"
              onClick={controller.addAllAvailableStockLines}
              disabled={controller.selectedSourceLocationId == null}
            >
              <IconPackageCheck data-icon="inline-start" />
              {copy.transferAllStock}
            </Button>
          )}
        </div>

        {controller.draftLines.length === 0 ? (
          <AppEmptyState
            compact
            title={copy.emptyIngredientsTitle}
            description={copy.emptyIngredientsDescription}
          />
        ) : (
          <ScrollArea className="h-80">
            <div className="flex flex-col gap-2 pr-2">
              {controller.draftLines.map((line) => {
                const lineUnitOptions = controller.getLineUnitOptions(line);
                const maxQuantityValue = controller.getLineMaxQuantityValue(line);
                return (
                  <Item
                    key={line.key}
                    variant="outline"
                    size="sm"
                    className="w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between"
                  >
                    <ItemContent className="w-full min-w-0 flex-1 sm:w-auto">
                      <span className="truncate text-sm font-medium">
                        {line.name}
                      </span>
                    </ItemContent>
                    <ItemActions className="grid w-full grid-cols-[minmax(0,1fr)_3rem] items-center gap-2 sm:flex sm:w-auto sm:shrink-0">
                      <InputGroup
                        size={controlSize}
                        className="col-span-2 w-full sm:w-40"
                      >
                        <QuantityInput
                          className="h-full"
                          placeholder={messages.inventory.common.quantityShort}
                          aria-label={copy.createNative.quantityLabel}
                          value={line.quantity}
                          onValueChange={(value) =>
                            controller.updateLineQuantity(line, value)
                          }
                          maxFractionDigits={3}
                          required
                        />
                        {maxQuantityValue ? (
                          <InputGroupAddon align="inline-end" className="py-0">
                            <Button
                              type="button"
                              variant="ghost"
                              size={isTouchLayout ? "touch" : "sm"}
                              className="shadow-none"
                              onClick={() => controller.fillLineMax(line)}
                            >
                              {FORM_VI.max}
                            </Button>
                          </InputGroupAddon>
                        ) : null}
                      </InputGroup>
                      {lineUnitOptions.length > 0 ? (
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(value) =>
                            controller.updateLineUnit(line, value)
                          }
                        >
                          <SelectTrigger
                            size={controlSize}
                            className="w-full sm:w-24"
                            aria-label={copy.unit}
                          >
                            <SelectValue placeholder={copy.selectUnit} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {lineUnitOptions.map((option) => (
                                <SelectItem
                                  key={option.unitId}
                                  value={String(option.unitId)}
                                  size={optionSize}
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          controlSize={controlSize}
                          className="w-full sm:w-20"
                          value={line.unit}
                          readOnly
                          aria-readonly="true"
                          required
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size={removeActionSize}
                        className="shrink-0"
                        onClick={() => controller.removeLine(line.key)}
                        aria-label={copy.removeLineAria}
                      >
                        <IconTrash />
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </AppSection>

      <FormField controlId="owner-transfer-notes" label={copy.transportNote}>
        <Textarea
          id="owner-transfer-notes"
          name="notes"
          rows={2}
          placeholder={copy.notesPlaceholder}
          className="min-h-20"
        />
      </FormField>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          size={actionSize}
          className="w-full sm:w-auto"
          render={<Link href={controller.listHref} />}
        >
          {ACTIONS_VI.cancel}
        </Button>
        <Button
          type="submit"
          size={actionSize}
          className="w-full sm:w-auto"
          disabled={controller.submitDisabled}
        >
          {controller.isPending ? copy.creating : copy.createSlip}
        </Button>
      </div>
    </form>
  );
}
