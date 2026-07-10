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
import { Label } from "@comtammatu/ui/components/label";
import { Progress } from "@comtammatu/ui/components/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import { AppDetailFooter, DescriptionList } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import type { TransferCreatePageData } from "@lib/inventory/transfer-create-data";
import {
  formatTransferLocationLabel,
  formatTransferOption,
  formatTransferTargetOption,
  getTransferWarehouseUnit,
} from "@lib/inventory/transfer-create-model";
import { useTransferCreateController } from "@lib/inventory/use-transfer-create-controller";
import { messages } from "@lib/messages";

interface BranchTransferCreateClientProps extends TransferCreatePageData {
  basePath: string;
}

export function BranchTransferCreateClient({
  basePath,
  ...data
}: BranchTransferCreateClientProps) {
  const controller = useTransferCreateController({
    ...data,
    basePath,
    branchScopeInPath: true,
  });
  const copy = messages.inventory.transfer;
  const operatorFlow = messages.inventory.operatorFlow;
  const sourceBranch = controller.currentBranch;
  const pageTitle = controller.isKitchenDispatch
    ? operatorFlow.kitchenDispatchTitle
    : operatorFlow.transferCreateTitle;
  const nativeCopy = controller.isKitchenDispatch
    ? copy.kitchenDispatchNative
    : copy.createNative;

  return (
    <form
      onSubmit={controller.submit}
      aria-busy={controller.isPending}
      className="flex min-w-0 touch-manipulation flex-col gap-3"
    >
      <BranchOperatorPanel
        size="sm"
        title={controller.flowStepMeta.label}
        description={controller.flowStepMeta.hint}
        headerHint={operatorFlow.stepBadge(
          controller.flowStep,
          controller.flowSteps.length,
        )}
        contentClassName="gap-2"
      >
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span className="text-muted-foreground">{pageTitle}</span>
          <span className="text-primary">{operatorFlow.current}</span>
        </div>
        <Progress className="h-2" value={controller.flowProgressValue} />
      </BranchOperatorPanel>

      {controller.loadFailed ? (
        <BranchOperatorPanel
          size="sm"
          tone="destructive"
          title={copy.createDataLoadFailedTitle}
        >
          <p role="alert" className="text-sm text-muted-foreground">
            {copy.createDataLoadFailedDescription}
          </p>
        </BranchOperatorPanel>
      ) : null}

      <div
        className={
          controller.selectedBranch
            ? "grid min-w-0 gap-3 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] md:items-start"
            : "grid min-w-0 gap-3"
        }
      >
        <BranchOperatorPanel
          size="sm"
          title={controller.flowSteps[0]?.label ?? copy.createTransferTitle}
          description={controller.flowSteps[0]?.hint}
          contentClassName="gap-3"
        >
          {controller.canCreateInboundRequest ? (
            <>
              <DescriptionList
                className="grid gap-2"
                descriptionClassName="font-semibold"
                items={[
                  {
                    term: copy.sourceBranchLabel,
                    description:
                      controller.inboundSourceName ??
                      copy.chooseSendingWarehouse,
                  },
                  {
                    term: copy.targetBranchLabel,
                    description:
                      controller.inboundDestinationName ??
                      copy.inboundToSelected,
                  },
                ]}
              />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branch-transfer-source">
                  {copy.sendingWarehouseRequired}
                </Label>
                <Select
                  value={controller.inboundFromBranchId}
                  onValueChange={controller.handleInboundSourceChange}
                >
                  <SelectTrigger
                    id="branch-transfer-source"
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue placeholder={copy.chooseSendingWarehouse} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {controller.inboundSourceOptions.map((branch) => (
                        <SelectItem
                          key={branch.id}
                          value={String(branch.id)}
                          className="min-h-11 py-2.5"
                        >
                          {formatTransferOption(
                            branch,
                            controller.requestDestinationBranchId,
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : controller.canCreateOutbound ? (
            <>
              <DescriptionList
                className="grid gap-2"
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
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="branch-transfer-source-location">
                    {copy.sourceLocationRequired}
                  </Label>
                  <Select
                    value={controller.outboundSourceLocationId}
                    onValueChange={
                      controller.handleOutboundSourceLocationChange
                    }
                  >
                    <SelectTrigger
                      id="branch-transfer-source-location"
                      size="touch"
                      className="w-full"
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
                              className="min-h-11 py-2.5"
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
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branch-transfer-target">
                  {copy.receivingWarehouseRequired}
                </Label>
                <Select
                  value={controller.outboundToBranchId}
                  onValueChange={controller.setOutboundToBranchId}
                >
                  <SelectTrigger
                    id="branch-transfer-target"
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue placeholder={copy.chooseReceivingWarehouse} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {controller.outboundDestinationOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          className="min-h-11 py-2.5"
                        >
                          {formatTransferTargetOption(option)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div role="status" className="border-t pt-3">
              <p className="text-sm font-semibold">
                {copy.createUnavailableTitle}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {copy.createForbidden}
              </p>
            </div>
          )}
        </BranchOperatorPanel>

        {controller.selectedBranch ? (
          <BranchOperatorPanel
            size="sm"
            title={
              controller.flowSteps[1]?.label ?? copy.ingredientsQtyRequired
            }
            description={controller.flowSteps[1]?.hint}
            contentClassName="gap-3"
          >
            <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="branch-transfer-ingredient">
                  {nativeCopy.ingredientLabel}
                </Label>
                <Select
                  value={controller.pickerIngredientId}
                  onValueChange={controller.setPickerIngredientId}
                >
                  <SelectTrigger
                    id="branch-transfer-ingredient"
                    size="touch"
                    className="w-full"
                  >
                    <SelectValue placeholder={nativeCopy.chooseItem} />
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
                          className="min-h-11 py-2.5"
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
                size="touch"
                className="self-end"
                onClick={controller.addIngredientLine}
                disabled={!controller.pickerIngredientId}
              >
                <IconPlus data-icon="inline-start" />
                {nativeCopy.addLine}
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
              {nativeCopy.transferAllStock}
            </Button>

            {controller.draftLines.length === 0 ? (
              <div className="py-4 text-center">
                <p className="text-sm font-medium">{nativeCopy.emptyTitle}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nativeCopy.emptyDescription}
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {controller.draftLines.map((line) => {
                  const lineUnitOptions = controller.getLineUnitOptions(line);
                  const maxQuantityValue =
                    controller.getLineMaxQuantityValue(line);
                  const quantityId = `transfer-${line.key}-quantity`;
                  const unitId = `transfer-${line.key}-unit`;

                  return (
                    <div
                      key={line.key}
                      className="flex min-w-0 flex-col gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-5">
                            {line.name}
                          </p>
                          {controller.sourceContextLabel ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {copy.createNative.sendFrom(
                                controller.sourceContextLabel,
                              )}
                            </p>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="touch"
                          className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => controller.removeLine(line.key)}
                          aria-label={copy.removeLineAria}
                        >
                          <IconTrash />
                        </Button>
                      </div>
                      <div className="grid min-w-0 grid-cols-2 gap-2">
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={quantityId}>
                            {copy.createNative.quantityLabel}
                          </Label>
                          <InputGroup className="h-12">
                            <FormattedNumberInput
                              id={quantityId}
                              maxFractionDigits={3}
                              value={line.quantity}
                              onValueChange={(value) =>
                                controller.updateLineQuantity(line, value)
                              }
                              placeholder={copy.createNative.quantityUnset}
                              inputMode="decimal"
                              className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-1 dark:bg-transparent"
                              required
                            />
                            {maxQuantityValue ? (
                              <InputGroupAddon align="inline-end">
                                <InputGroupButton
                                  type="button"
                                  className="h-11 min-w-11 px-2"
                                  onClick={() => controller.fillLineMax(line)}
                                >
                                  {FORM_VI.max}
                                </InputGroupButton>
                              </InputGroupAddon>
                            ) : null}
                          </InputGroup>
                        </div>
                        <div className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={unitId}>{copy.unit}</Label>
                          {lineUnitOptions.length > 0 ? (
                            <Select
                              value={line.entryUnitId}
                              onValueChange={(value) =>
                                controller.updateLineUnit(line, value)
                              }
                            >
                              <SelectTrigger
                                id={unitId}
                                size="touch"
                                className="w-full"
                              >
                                <SelectValue placeholder={copy.selectUnit} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  {lineUnitOptions.map((option) => (
                                    <SelectItem
                                      key={option.unitId}
                                      value={String(option.unitId)}
                                      className="min-h-11 py-2.5"
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              id={unitId}
                              className="h-12"
                              value={line.unit}
                              readOnly
                              aria-readonly="true"
                              required
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </BranchOperatorPanel>
        ) : null}
      </div>

      {controller.draftLines.length > 0 ? (
        <BranchOperatorPanel
          size="sm"
          title={FORM_VI.notes}
          contentClassName="grid gap-3 md:grid-cols-2"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="branch-transfer-vehicle">{copy.vehicleInfo}</Label>
            <Input
              id="branch-transfer-vehicle"
              name="vehicleInfo"
              className="h-12"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="branch-transfer-notes">{FORM_VI.notes}</Label>
            <Textarea
              id="branch-transfer-notes"
              name="notes"
              rows={3}
              placeholder={copy.notesPlaceholder}
              className="min-h-24"
            />
          </div>
        </BranchOperatorPanel>
      ) : null}

      <AppDetailFooter
        sticky
        leading={
          <Button variant="outline" size="touch" asChild>
            <Link href={controller.listHref}>{ACTIONS_VI.cancel}</Link>
          </Button>
        }
        trailing={
          <Button
            type="submit"
            size="touch-lg"
            disabled={controller.submitDisabled}
          >
            {controller.isPending ? copy.creating : nativeCopy.submit}
          </Button>
        }
      />
    </form>
  );
}
