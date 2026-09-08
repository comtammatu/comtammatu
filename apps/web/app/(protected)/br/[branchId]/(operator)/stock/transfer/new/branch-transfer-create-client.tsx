"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ListFilter as IconListFilter,
  PackageCheck as IconPackageCheck,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
  X as IconX,
} from "lucide-react";
import { ACTIONS_VI, FORM_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppSheet,
} from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { TransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { TransferCreateRouteFields } from "@lib/inventory/transfer-create-route-fields";
import {
  getTransferWarehouseUnit,
  type TransferDraftLine,
} from "@lib/inventory/transfer-create-model";
import {
  useTransferCreateController,
  type TransferCreateDirection,
} from "@lib/inventory/use-transfer-create-controller";
import { messages } from "@lib/messages";

export function BranchTransferCreateClient({
  branchId,
  data,
  initialDirection,
}: {
  branchId: number;
  data: TransferCreatePageData;
  initialDirection?: TransferCreateDirection;
}) {
  const basePath = `/br/${branchId}/stock/transfer`;
  const controller = useTransferCreateController({
    ...data,
    basePath,
    initialDirection,
  });
  const copy = messages.inventory.transfer;
  const journeyCopy = messages.inventory.stockRequests.journey;
  const [padLineKey, setPadLineKey] = useState<string | null>(null);
  const padLine =
    controller.draftLines.find((line) => line.key === padLineKey) ?? null;

  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkSearch, setBulkSearch] = useState("");
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<number>>(
    () => new Set(),
  );
  const deferredBulkSearch = useDeferredValue(bulkSearch.trim().toLowerCase());

  const existingIngredientIds = useMemo(
    () => new Set(controller.draftLines.map((line) => line.ingredientId)),
    [controller.draftLines],
  );

  const filteredBulkIngredients = useMemo(() => {
    if (!deferredBulkSearch) return controller.activeIngredients;
    return controller.activeIngredients.filter((item) =>
      item.name.toLowerCase().includes(deferredBulkSearch),
    );
  }, [controller.activeIngredients, deferredBulkSearch]);

  function toggleBulkIngredient(id: number) {
    setSelectedBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleConfirmBulk() {
    if (selectedBulkIds.size === 0) return;
    controller.addMultipleIngredientLines(Array.from(selectedBulkIds));
    setSelectedBulkIds(new Set());
    setBulkPickerOpen(false);
  }

  function handleOpenBulkPicker() {
    setSelectedBulkIds(new Set());
    setBulkSearch("");
    setBulkPickerOpen(true);
  }

  function openPad(line: TransferDraftLine) {
    setPadLineKey(line.key);
  }

  return (
    <BranchOperatorPage
      title={journeyCopy.manualTransferAction}
      description={journeyCopy.manualTransferDescription}
      back={<AppBackLink href={controller.listHref} />}
    >
      <form
        onSubmit={controller.submit}
        className="flex min-w-0 flex-col gap-3"
      >
        {controller.loadFailed ? (
          <AppEmptyState
            compact
            mode="error"
            title={copy.createDataLoadFailedTitle}
            description={copy.createDataLoadFailedDescription}
          />
        ) : null}

        <BranchOperatorPanel title={copy.createTransferTitle} size="sm">
          <TransferCreateRouteFields
            controller={controller}
            controlSize="touch"
            optionSize="touch"
          />
        </BranchOperatorPanel>

        <BranchOperatorPanel
          title={copy.ingredientsQtyRequired}
          badge={{ children: controller.draftLines.length }}
          size="sm"
        >
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                type="button"
                variant="outline"
                size="touch"
                className="w-full justify-center font-medium sm:w-auto"
                onClick={handleOpenBulkPicker}
              >
                <IconListFilter data-icon="inline-start" />
                {copy.bulkPickerTrigger}
              </Button>
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
            </div>
            {controller.isPull ? null : (
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
            )}
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
                  <Item
                    key={line.key}
                    variant="outline"
                    className="items-start"
                  >
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
          <label
            htmlFor="branch-transfer-notes"
            className="text-sm font-medium"
          >
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
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="touch"
                className="min-w-0 flex-1 sm:flex-initial"
                render={<Link href={controller.listHref} />}
              >
                {ACTIONS_VI.cancel}
              </Button>
              {controller.draftLines.length > 0 ? (
                <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                  {copy.bulkItemsCount(controller.draftLines.length)}
                </span>
              ) : null}
            </div>
          }
          trailing={
            <Button
              type="submit"
              size="touch"
              className="min-w-0 flex-1 sm:flex-initial"
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
          padLine && padLine.quantity ? Number(padLine.quantity) : null
        }
        onConfirm={(value) => {
          if (!padLine) return;
          controller.updateLineQuantity(padLine, String(value));
        }}
        allowDecimal
      />

      <AppSheet
        open={bulkPickerOpen}
        onOpenChange={setBulkPickerOpen}
        title={copy.bulkPickerTitle}
        description={copy.bulkPickerDescription}
        side="bottom"
        contentClassName="max-h-dvh-95 bg-background flex flex-col min-h-0"
        footerClassName="shrink-0 border-t bg-background/95 backdrop-blur flex items-center justify-between gap-2 p-2"
        footer={
          <>
            <div className="text-xs font-medium text-muted-foreground">
              {selectedBulkIds.size > 0
                ? copy.bulkSelectedCount(selectedBulkIds.size)
                : copy.bulkNoneSelected}
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setBulkPickerOpen(false)}
              >
                {ACTIONS_VI.cancel}
              </Button>
              <Button
                type="button"
                size="touch"
                disabled={selectedBulkIds.size === 0}
                onClick={handleConfirmBulk}
              >
                {copy.bulkAddAction} {selectedBulkIds.size > 0 ? `(${selectedBulkIds.size})` : ""}
              </Button>
            </div>
          </>
        }
      >
        <div className="sticky top-0 z-10 bg-background pb-2">
          <InputGroup className="min-h-12 min-w-0 w-full">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={copy.bulkSearchAria}
              value={bulkSearch}
              onChange={(e) => setBulkSearch(e.target.value)}
              placeholder={copy.bulkSearchPlaceholder}
              inputMode="search"
            />
            {bulkSearch ? (
              <InputGroupAddon align="inline-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={copy.bulkClearSearchAria}
                  onClick={() => setBulkSearch("")}
                >
                  <IconX />
                </Button>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 py-2">
          {filteredBulkIngredients.length === 0 ? (
            <AppEmptyState
              compact
              symbol="riceGrain"
              title={copy.bulkNotFoundTitle}
              description={copy.bulkNotFoundDescription}
            />
          ) : (
            <ItemGroup className="gap-1">
              {filteredBulkIngredients.map((ingredient) => {
                const isAlreadyAdded = existingIngredientIds.has(ingredient.id);
                const isSelected = selectedBulkIds.has(ingredient.id);
                const unit = getTransferWarehouseUnit(ingredient);

                return (
                  <Item
                    key={ingredient.id}
                    variant={isSelected ? "muted" : "default"}
                    size="sm"
                    className={cn(
                      "min-h-12 items-center gap-3 border-b border-border/50 px-2 py-2 last:border-b-0 select-none",
                      isAlreadyAdded
                        ? "opacity-50 cursor-not-allowed bg-muted/30"
                        : "cursor-pointer",
                    )}
                    onClick={() => {
                      if (!isAlreadyAdded) toggleBulkIngredient(ingredient.id);
                    }}
                  >
                    <Checkbox
                      checked={isAlreadyAdded || isSelected}
                      disabled={isAlreadyAdded}
                      onCheckedChange={() => {
                        if (!isAlreadyAdded) toggleBulkIngredient(ingredient.id);
                      }}
                      aria-label={copy.bulkSelectIngredientAria(ingredient.name)}
                      className="size-5 shrink-0 pointer-events-none"
                    />
                    <ItemContent className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ItemTitle size="heading" className="min-w-0 truncate text-sm">
                          {ingredient.name}
                        </ItemTitle>
                        {isAlreadyAdded ? (
                          <Badge variant="secondary" className="shrink-0 text-2xs">
                            {copy.bulkAlreadyAddedBadge}
                          </Badge>
                        ) : null}
                      </div>
                      {unit ? (
                        <ItemDescription className="text-xs">
                          {copy.bulkUnitLabel(unit)}
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </AppSheet>
    </BranchOperatorPage>
  );
}
