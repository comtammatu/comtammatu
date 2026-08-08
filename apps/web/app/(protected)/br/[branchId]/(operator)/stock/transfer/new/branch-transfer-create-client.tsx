"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft as IconArrowLeft,
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Combobox } from "@/components/form/combobox";
import { NumberPadSheet } from "@/components/form/number-pad-sheet";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { TransferCreatePageData } from "@lib/inventory/transfer-create-data";
import {
  formatTransferLocationLabel,
  formatTransferTargetOption,
  getTransferWarehouseUnit,
  type TransferDraftLine,
} from "@lib/inventory/transfer-create-model";
import { useTransferCreateController } from "@lib/inventory/use-transfer-create-controller";
import { messages } from "@lib/messages";

export function BranchTransferCreateClient({
  branchId,
  data,
}: {
  branchId: number;
  data: TransferCreatePageData;
}) {
  const basePath = `/br/${branchId}/stock/transfer`;
  const controller = useTransferCreateController({
    ...data,
    basePath,
  });
  const copy = messages.inventory.transfer;
  const journeyCopy = messages.inventory.stockRequests.journey;
  const sourceBranch = controller.currentBranch;
  const [padLineKey, setPadLineKey] = useState<string | null>(null);
  const padLine =
    controller.draftLines.find((line) => line.key === padLineKey) ?? null;

  function openPad(line: TransferDraftLine) {
    setPadLineKey(line.key);
  }

  return (
    <BranchOperatorPage
      title={journeyCopy.manualTransferAction}
      description={journeyCopy.manualTransferDescription}
      hideHeaderOnMobile
    >
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={<Link href={basePath} aria-label={ACTIONS_VI.back} />}
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {journeyCopy.manualTransferAction}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {journeyCopy.manualTransferDescription}
          </p>
        </div>
      </BranchOperatorControlBar>

      <form onSubmit={controller.submit} className="flex min-w-0 flex-col gap-3">
        {controller.loadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            title={copy.createDataLoadFailedTitle}
            description={copy.createDataLoadFailedDescription}
          />
        ) : null}

        <BranchOperatorPanel title={copy.createTransferTitle} size="sm">
          {controller.canCreateOutbound ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm text-muted-foreground">
                  {copy.sourceBranchLabel}
                </span>
                <span className="font-semibold">
                  {controller.myBranchName ?? copy.outboundFromSelected}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  {copy.targetBranchLabel}
                  <span aria-hidden="true"> *</span>
                </span>
                <Select
                  value={controller.outboundToBranchId}
                  onValueChange={controller.setOutboundToBranchId}
                >
                  <SelectTrigger
                    size="touch"
                    className="w-full"
                    aria-required
                    aria-label={copy.targetBranchLabel}
                  >
                    <SelectValue placeholder={copy.chooseReceivingWarehouse} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {controller.outboundDestinationOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          size="touch"
                        >
                          {formatTransferTargetOption(option)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              {controller.outboundSourceLocationOptions.length > 1 &&
              sourceBranch ? (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">
                    {copy.sourceLocationRequired}
                  </span>
                  <Select
                    value={controller.outboundSourceLocationId}
                    onValueChange={controller.handleOutboundSourceLocationChange}
                  >
                    <SelectTrigger size="touch" className="w-full" aria-required>
                      <SelectValue placeholder={copy.chooseSourceLocation} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {controller.outboundSourceLocationOptions.map(
                          (location) => (
                            <SelectItem
                              key={location.id}
                              value={String(location.id)}
                              size="touch"
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
                </div>
              ) : null}
            </div>
          ) : (
            <AppEmptyState
              compact
              title={copy.createUnavailableTitle}
              description={copy.createForbidden}
            />
          )}
        </BranchOperatorPanel>

        <BranchOperatorPanel
          title={copy.ingredientsQtyRequired}
          badge={{ children: controller.draftLines.length }}
          size="sm"
        >
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
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
                  size="touch"
                  className="w-full"
                  placeholder={copy.chooseIngredient}
                  searchPlaceholder={INVENTORY_VI.searchByName}
                  aria-label={copy.createNative.ingredientLabel}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-touch"
                onClick={controller.addIngredientLine}
                disabled={!controller.pickerIngredientId}
                aria-label={copy.addIngredientAria}
              >
                <IconPlus />
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="w-full"
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
            <ItemGroup className="mt-3 grid gap-2">
              {controller.draftLines.map((line) => {
                const lineUnitOptions = controller.getLineUnitOptions(line);
                const maxQuantityValue =
                  controller.getLineMaxQuantityValue(line);
                const qty = Number(line.quantity);
                return (
                  <Item key={line.key} variant="outline" className="items-start">
                    <ItemContent className="min-w-0 gap-2">
                      <ItemTitle size="heading" className="line-clamp-none">
                        {line.name}
                      </ItemTitle>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="w-full justify-between font-mono tabular-nums"
                        onClick={() => openPad(line)}
                      >
                        <span>
                          {Number.isFinite(qty) && line.quantity
                            ? line.quantity
                            : messages.inventory.common.quantityShort}
                        </span>
                        <span className="text-muted-foreground">
                          {line.unit}
                        </span>
                      </Button>
                      {lineUnitOptions.length > 1 ? (
                        <Select
                          value={line.entryUnitId}
                          onValueChange={(value) =>
                            controller.updateLineUnit(line, value)
                          }
                        >
                          <SelectTrigger size="touch" aria-label={copy.unit}>
                            <SelectValue placeholder={copy.selectUnit} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {lineUnitOptions.map((option) => (
                                <SelectItem
                                  key={option.unitId}
                                  value={String(option.unitId)}
                                  size="touch"
                                >
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      ) : (
                        <ItemDescription>{line.unit}</ItemDescription>
                      )}
                      {maxQuantityValue ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="touch"
                          className="w-full"
                          onClick={() => controller.fillLineMax(line)}
                        >
                          {FORM_VI.max}: {maxQuantityValue}
                        </Button>
                      ) : null}
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-touch"
                        onClick={() => controller.removeLine(line.key)}
                        aria-label={copy.removeLineAria}
                      >
                        <IconTrash />
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </BranchOperatorPanel>

        <div className="flex flex-col gap-2">
          <label htmlFor="branch-transfer-notes" className="text-sm font-medium">
            {copy.transportNote}
          </label>
          <Textarea
            id="branch-transfer-notes"
            name="notes"
            rows={2}
            placeholder={copy.notesPlaceholder}
            className="min-h-20"
          />
        </div>

        <AppDetailFooter
          sticky
          leading={
            <Button
              variant="outline"
              size="touch"
              className="min-w-0 flex-1"
              render={<Link href={controller.listHref} />}
            >
              {ACTIONS_VI.cancel}
            </Button>
          }
          trailing={
            <Button
              type="submit"
              size="touch"
              className="min-w-0 flex-1"
              disabled={controller.submitDisabled}
            >
              {controller.isPending ? copy.creating : copy.createSlip}
            </Button>
          }
        />
      </form>

      <NumberPadSheet
        open={padLine != null}
        onOpenChange={(open) => {
          if (!open) setPadLineKey(null);
        }}
        title={padLine ? padLine.name : ""}
        suffix={padLine?.unit}
        initialValue={
          padLine && padLine.quantity
            ? Number(padLine.quantity)
            : null
        }
        onConfirm={(value) => {
          if (!padLine) return;
          controller.updateLineQuantity(padLine, String(value));
        }}
        allowDecimal
      />
    </BranchOperatorPage>
  );
}
