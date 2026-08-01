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
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import {
  AppEmptyState,
  AppSection,
  DescriptionList,
} from "@/components/surface";
import type { TransferCreatePageData } from "@lib/inventory/transfer-create-data";
import {
  formatTransferLocationLabel,
  formatTransferTargetOption,
  getTransferWarehouseUnit,
} from "@lib/inventory/transfer-create-model";
import { useTransferCreateController } from "@lib/inventory/use-transfer-create-controller";
import { messages } from "@lib/messages";

interface CreateTransferFormProps extends TransferCreatePageData {
  basePath?: string;
}

export function CreateTransferForm({
  basePath = "/inventory/transfers",
  ...data
}: CreateTransferFormProps) {
  const controller = useTransferCreateController({
    ...data,
    basePath,
  });
  const copy = messages.inventory.transfer;
  const sourceBranch = controller.currentBranch;
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
        {controller.canCreateOutbound ? (
          <div className="flex flex-col gap-3">
            <DescriptionList
              className="grid gap-2 sm:grid-cols-2"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: copy.sourceBranchLabel,
                  description:
                    controller.myBranchName ?? copy.outboundFromSelected,
                },
                {
                  term: copy.targetBranchLabel,
                  description:
                    controller.outboundDestinationName ??
                    copy.chooseReceivingWarehouse,
                },
              ]}
            />
            {controller.outboundSourceLocationOptions.length > 1 &&
            sourceBranch ? (
              <FormField
                controlId="owner-transfer-source-location"
                label={copy.sourceLocationRequired}
                required
              >
                <Select
                  value={controller.outboundSourceLocationId}
                  onValueChange={controller.handleOutboundSourceLocationChange}
                >
                  <SelectTrigger
                    id="owner-transfer-source-location"
                    size={controlSize}
                    className="w-full"
                    aria-required
                  >
                    <SelectValue placeholder={copy.chooseSourceLocation} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {controller.outboundSourceLocationOptions.map(
                        (location) => (
                          <SelectItem
                            key={location.id}
                            value={String(location.id)}
                            size={optionSize}
                          >
                            {formatTransferLocationLabel(
                              sourceBranch,
                              location.kind,
                            )}
                          </SelectItem>
                        ),
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FormField>
            ) : null}
            <FormField
              controlId="owner-transfer-target"
              label={copy.receivingWarehouseRequired}
              required
            >
              <Select
                value={controller.outboundToBranchId}
                onValueChange={controller.setOutboundToBranchId}
              >
                <SelectTrigger
                  id="owner-transfer-target"
                  size={controlSize}
                  className="w-full"
                  aria-required
                >
                  <SelectValue placeholder={copy.chooseReceivingWarehouse} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {controller.outboundDestinationOptions.map((option) => (
                      <SelectItem
                        key={option.value}
                        value={option.value}
                        size={optionSize}
                      >
                        {formatTransferTargetOption(option)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        ) : (
          <AppEmptyState
            compact
            title={copy.createUnavailableTitle}
            description={copy.createForbidden}
          />
        )}
      </AppSection>

      <AppSection title={copy.ingredientsQtyRequired}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 items-end gap-2">
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
              size={removeActionSize}
              className="shrink-0"
              onClick={controller.addIngredientLine}
              disabled={!controller.pickerIngredientId}
              aria-label={copy.addIngredientAria}
            >
              <IconPlus data-icon="inline-start" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size={actionSize}
            className="w-full shrink-0 sm:w-auto"
            onClick={controller.addAllAvailableStockLines}
            disabled={controller.selectedSourceLocationId == null}
          >
            <IconPackageCheck data-icon="inline-start" />
            {copy.transferAllStock}
          </Button>
        </div>

        {controller.draftLines.length === 0 ? (
          <AppEmptyState
            compact
            title={copy.emptyIngredientsTitle}
            description={copy.emptyIngredientsDescription}
          />
        ) : (
          <div className="flex flex-col gap-2">
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
                      <FormattedNumberInput
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
        )}
      </AppSection>

      <AppSection title={FORM_VI.notes}>
        <FormField controlId="owner-transfer-vehicle" label={copy.vehicleInfo}>
          <Input
            id="owner-transfer-vehicle"
            name="vehicleInfo"
            controlSize={controlSize}
          />
        </FormField>
        <FormField controlId="owner-transfer-notes" label={FORM_VI.notes}>
          <Textarea
            id="owner-transfer-notes"
            name="notes"
            rows={3}
            placeholder={copy.notesPlaceholder}
            className="min-h-24"
          />
        </FormField>
      </AppSection>

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
