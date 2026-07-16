"use client";

import Link from "next/link";
import {
  PackageCheck as IconPackageCheck,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
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
  formatTransferOption,
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
        {controller.canCreateInboundRequest ? (
          <div className="flex flex-col gap-3">
            <DescriptionList
              className="grid gap-2 sm:grid-cols-2"
              descriptionClassName="font-semibold"
              items={[
                {
                  term: copy.sourceBranchLabel,
                  description:
                    controller.inboundSourceName ?? copy.chooseSendingWarehouse,
                },
                {
                  term: copy.targetBranchLabel,
                  description:
                    controller.inboundDestinationName ?? copy.inboundToSelected,
                },
              ]}
            />
            <FormField
              controlId="admin-dashboard-transfer-source"
              label={copy.sendingWarehouseRequired}
              required
            >
              <Select
                value={controller.inboundFromBranchId}
                onValueChange={controller.handleInboundSourceChange}
              >
                <SelectTrigger
                  id="admin-dashboard-transfer-source"
                  size="field"
                  className="w-full"
                  aria-required
                >
                  <SelectValue placeholder={copy.chooseSendingWarehouse} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {controller.inboundSourceOptions.map((branch) => (
                      <SelectItem key={branch.id} value={String(branch.id)}>
                        {formatTransferOption(
                          branch,
                          controller.requestDestinationBranchId,
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </FormField>
          </div>
        ) : controller.canCreateOutbound ? (
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
                controlId="admin-dashboard-transfer-source-location"
                label={copy.sourceLocationRequired}
                required
              >
                <Select
                  value={controller.outboundSourceLocationId}
                  onValueChange={controller.handleOutboundSourceLocationChange}
                >
                  <SelectTrigger
                    id="admin-dashboard-transfer-source-location"
                    size="field"
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
              controlId="admin-dashboard-transfer-target"
              label={copy.receivingWarehouseRequired}
              required
            >
              <Select
                value={controller.outboundToBranchId}
                onValueChange={controller.setOutboundToBranchId}
              >
                <SelectTrigger
                  id="admin-dashboard-transfer-target"
                  size="field"
                  className="w-full"
                  aria-required
                >
                  <SelectValue placeholder={copy.chooseReceivingWarehouse} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {controller.outboundDestinationOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
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
              <Select
                value={controller.pickerIngredientId}
                onValueChange={controller.setPickerIngredientId}
              >
                <SelectTrigger
                  id="admin-dashboard-transfer-ingredient"
                  size="sm"
                  className="w-full"
                  aria-label={copy.createNative.ingredientLabel}
                >
                  <SelectValue placeholder={copy.chooseIngredient} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {controller.activeIngredients.map((ingredient) => (
                      <SelectItem
                        key={ingredient.id}
                        value={String(ingredient.id)}
                        textValue={`${ingredient.name} ${getTransferWarehouseUnit(
                          ingredient,
                        )} ${ingredient.id}`}
                      >
                        {ingredient.name} (
                        {getTransferWarehouseUnit(ingredient)})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
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
            size="sm"
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
                  className="w-full flex-nowrap justify-between gap-4"
                >
                  <ItemContent className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      {line.name}
                    </span>
                  </ItemContent>
                  <ItemActions className="flex shrink-0 items-center gap-2">
                    <InputGroup className="h-8 w-32">
                      <FormattedNumberInput
                        className="h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
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
                        <InputGroupAddon align="inline-end">
                          <InputGroupButton
                            type="button"
                            onClick={() => controller.fillLineMax(line)}
                          >
                            {FORM_VI.max}
                          </InputGroupButton>
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
                          className="h-8 w-20"
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
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-8 w-16"
                        value={line.unit}
                        readOnly
                        aria-readonly="true"
                        required
                      />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
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
        <FormField
          controlId="admin-dashboard-transfer-vehicle"
          label={copy.vehicleInfo}
        >
          <Input
            id="admin-dashboard-transfer-vehicle"
            name="vehicleInfo"
            className="h-10"
          />
        </FormField>
        <FormField
          controlId="admin-dashboard-transfer-notes"
          label={FORM_VI.notes}
        >
          <Textarea
            id="admin-dashboard-transfer-notes"
            name="notes"
            rows={3}
            placeholder={copy.notesPlaceholder}
            className="min-h-24"
          />
        </FormField>
      </AppSection>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" asChild>
          <Link href={controller.listHref}>{ACTIONS_VI.cancel}</Link>
        </Button>
        <Button type="submit" disabled={controller.submitDisabled}>
          {controller.isPending ? copy.creating : copy.createSlip}
        </Button>
      </div>
    </form>
  );
}
