"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight as IconArrowLeftRight,
  RotateCcw as IconRotateCcw,
} from "lucide-react";
import { FORM_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import type {
  IntraSiteTransferData,
  IntraSiteTransferIngredient,
} from "@lib/inventory/intra-site-transfer-data";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import { messages } from "@lib/messages";
import {
  clampIssueEntryQuantity,
  formatIssueMaxEntryQuantity,
  getDefaultIssueUnit,
  getIssueBaseQuantity,
  getIssueMaxEntryQuantity,
  getIssueUnitOptions,
  type IssueUnitOption,
} from "@/(protected)/inventory/_lib/issue-units";
import {
  commitIntraSiteTransfer,
  reverseIntraSiteTransfer,
} from "@/(protected)/inventory/transfer-actions";

type Direction = "warehouse_to_kitchen" | "kitchen_to_warehouse";
const copy = messages.inventory.transfer.intraSite;

function positiveQuantity(value: string | undefined): number | null {
  const quantity = Number(value ?? "");
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

function getInitialUnits(
  ingredients: IntraSiteTransferIngredient[],
): Record<number, number> {
  return Object.fromEntries(
    ingredients.map((ingredient) => {
      const defaultUnit = getDefaultIssueUnit(ingredient);
      return [
        ingredient.ingredientId,
        defaultUnit?.unitId ?? ingredient.baseUnitId,
      ];
    }),
  );
}

function resolveSelectedUnit(
  ingredient: IntraSiteTransferIngredient,
  unitId?: number,
): IssueUnitOption | null {
  const options = getIssueUnitOptions(ingredient);
  if (unitId != null) {
    const found = options.find((opt) => opt.unitId === unitId);
    if (found) return found;
  }
  return getDefaultIssueUnit(ingredient);
}

export function IntraSiteTransferDialog({
  data,
  triggerSize = "default",
  detailBasePath,
  initialQuantities = {},
  triggerLabel = copy.defaultTrigger,
}: {
  data: IntraSiteTransferData;
  triggerSize?: ComponentProps<typeof Button>["size"];
  detailBasePath?: string;
  initialQuantities?: Record<number, number>;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const controlSize = isTouchLayout ? "touch" : "field";
  const optionSize = isTouchLayout ? "touch" : "default";

  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("warehouse_to_kitchen");
  const [selectedUnits, setSelectedUnits] = useState<Record<number, number>>(
    () => getInitialUnits(data.ingredients),
  );
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      Object.entries(initialQuantities).map(([id, quantity]) => [
        id,
        String(quantity),
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  const source =
    direction === "warehouse_to_kitchen" ? data.warehouse : data.kitchen;
  const destination =
    direction === "warehouse_to_kitchen" ? data.kitchen : data.warehouse;
  const availableIngredients = useMemo(
    () =>
      data.ingredients.filter((ingredient) =>
        direction === "warehouse_to_kitchen"
          ? ingredient.warehouseQuantity > 0
          : ingredient.kitchenQuantity > 0,
      ),
    [data.ingredients, direction],
  );

  function availableQuantity(ingredientId: number): number {
    const ingredient = data.ingredients.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    if (!ingredient) return 0;
    return direction === "warehouse_to_kitchen"
      ? ingredient.warehouseQuantity
      : ingredient.kitchenQuantity;
  }

  function changeDirection(nextDirection: Direction) {
    setDirection(nextDirection);
    setQuantities({});
    idempotencyKey.current = null;
  }

  function handleUnitChange(ingredientId: number, nextUnitId: number) {
    setSelectedUnits((current) => ({
      ...current,
      [ingredientId]: nextUnitId,
    }));
    const ingredient = data.ingredients.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    if (!ingredient) return;
    const nextUnit = resolveSelectedUnit(ingredient, nextUnitId);
    const maxQty = getIssueMaxEntryQuantity(
      availableQuantity(ingredientId),
      nextUnit,
    );
    setQuantities((current) => {
      const existing = current[ingredientId];
      if (!existing) return current;
      return {
        ...current,
        [ingredientId]: clampIssueEntryQuantity(existing, maxQty),
      };
    });
    idempotencyKey.current = null;
  }

  function fillAll() {
    setQuantities(
      Object.fromEntries(
        availableIngredients.map((ingredient) => {
          const selectedUnit = resolveSelectedUnit(
            ingredient,
            selectedUnits[ingredient.ingredientId],
          );
          const maxQty = getIssueMaxEntryQuantity(
            availableQuantity(ingredient.ingredientId),
            selectedUnit,
          );
          return [
            ingredient.ingredientId,
            formatIssueMaxEntryQuantity(maxQty),
          ];
        }),
      ),
    );
    idempotencyKey.current = null;
  }

  function submit() {
    let invalidIngredient: string | null = null;
    const lines = availableIngredients.flatMap((ingredient) => {
      const quantity = positiveQuantity(quantities[ingredient.ingredientId]);
      if (quantity == null) return [];
      const selectedUnit = resolveSelectedUnit(
        ingredient,
        selectedUnits[ingredient.ingredientId],
      );
      const baseQtyNeeded = getIssueBaseQuantity(quantity, selectedUnit);
      const baseQtyAvailable = availableQuantity(ingredient.ingredientId);
      if (baseQtyNeeded > baseQtyAvailable + 1e-6) {
        invalidIngredient ??= ingredient.name;
        return [];
      }
      return [
        {
          ingredientId: ingredient.ingredientId,
          quantity,
          entryUnitId: selectedUnit?.unitId ?? ingredient.baseUnitId,
        },
      ];
    });
    if (invalidIngredient) {
      toast.error(copy.quantityExceedsSource(invalidIngredient));
      return;
    }
    if (lines.length === 0) {
      toast.error(copy.lineRequired);
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();

    startTransition(async () => {
      const result = await commitIntraSiteTransfer({
        branchId: data.branchId,
        fromLocationId: source.id,
        toLocationId: destination.id,
        lines,
        notes,
        idempotencyKey: idempotencyKey.current!,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.commitFailed);
        return;
      }
      const transferId = (result.data as { id?: number } | undefined)?.id;
      toast.success(copy.commitSuccess);
      setOpen(false);
      setQuantities({});
      setNotes("");
      idempotencyKey.current = null;
      if (detailBasePath && transferId) {
        router.push(`${detailBasePath}/${transferId}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        <IconArrowLeftRight data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <AppDialog
        variant="document"
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        description={copy.description}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {copy.close}
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              {copy.confirm}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={
                direction === "warehouse_to_kitchen" ? "secondary" : "outline"
              }
              onClick={() => changeDirection("warehouse_to_kitchen")}
            >
              {copy.warehouseToKitchen}
            </Button>
            <Button
              type="button"
              variant={
                direction === "kitchen_to_warehouse" ? "secondary" : "outline"
              }
              onClick={() => changeDirection("kitchen_to_warehouse")}
            >
              {copy.kitchenToWarehouse}
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {source.name} → {destination.name}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fillAll}
              disabled={availableIngredients.length === 0}
            >
              {copy.transferAll}
            </Button>
          </div>
          {availableIngredients.length === 0 ? (
            <AppEmptyState
              compact
              title={copy.emptySourceTitle}
              description={copy.emptySourceDescription}
            />
          ) : (
            <ScrollArea className="h-80">
              <div className="flex flex-col gap-2 pr-2">
                {availableIngredients.map((ingredient) => {
                  const unitOptions = getIssueUnitOptions(ingredient);
                  const selectedUnit = resolveSelectedUnit(
                    ingredient,
                    selectedUnits[ingredient.ingredientId],
                  );
                  const selectedUnitId =
                    selectedUnit?.unitId ?? ingredient.baseUnitId;
                  const maxEntryQuantity = getIssueMaxEntryQuantity(
                    availableQuantity(ingredient.ingredientId),
                    selectedUnit,
                  );
                  const maxQuantityValue =
                    formatIssueMaxEntryQuantity(maxEntryQuantity);

                  return (
                    <Item
                      key={ingredient.ingredientId}
                      variant="outline"
                      size="sm"
                      className="w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between"
                    >
                      <ItemContent className="w-full min-w-0 flex-1 sm:w-auto">
                        <ItemTitle className="truncate">
                          {ingredient.name}
                        </ItemTitle>
                        <ItemDescription>
                          {copy.availableQuantity(
                            Number(maxQuantityValue || "0"),
                            selectedUnit?.label ?? ingredient.unit,
                          )}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0">
                        <InputGroup
                          size={controlSize}
                          className="col-span-2 w-full sm:w-40"
                        >
                          <QuantityInput
                            value={quantities[ingredient.ingredientId] ?? ""}
                            onValueChange={(value) => {
                              setQuantities((current) => ({
                                ...current,
                                [ingredient.ingredientId]:
                                  clampIssueEntryQuantity(
                                    value,
                                    maxEntryQuantity,
                                  ),
                              }));
                              idempotencyKey.current = null;
                            }}
                            maxFractionDigits={3}
                            placeholder="0"
                            aria-label={copy.quantityAria(ingredient.name)}
                            className="h-full"
                          />
                          {maxQuantityValue ? (
                            <InputGroupAddon
                              align="inline-end"
                              className="py-0"
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size={isTouchLayout ? "touch" : "sm"}
                                className="shadow-none"
                                onClick={() => {
                                  setQuantities((current) => ({
                                    ...current,
                                    [ingredient.ingredientId]: maxQuantityValue,
                                  }));
                                  idempotencyKey.current = null;
                                }}
                              >
                                {FORM_VI.max}
                              </Button>
                            </InputGroupAddon>
                          ) : null}
                        </InputGroup>
                        {unitOptions.length > 1 ? (
                          <Select
                            value={String(selectedUnitId)}
                            onValueChange={(value) =>
                              handleUnitChange(
                                ingredient.ingredientId,
                                Number(value),
                              )
                            }
                          >
                            <SelectTrigger
                              size={controlSize}
                              className="w-full sm:w-24"
                              aria-label={messages.inventory.transfer.unit}
                            >
                              <SelectValue
                                placeholder={messages.inventory.transfer.selectUnit}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {unitOptions.map((option) => (
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
                            value={selectedUnit?.label ?? ingredient.unit}
                            readOnly
                            aria-readonly="true"
                          />
                        )}
                      </ItemActions>
                    </Item>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={copy.notesPlaceholder}
            aria-label={copy.notesAria}
          />
        </div>
      </AppDialog>
    </>
  );
}

export function ReverseIntraSiteTransferDialog({
  transfer,
  triggerSize = "default",
}: {
  transfer: TransferDetail;
  triggerSize?: ComponentProps<typeof Button>["size"];
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(1024);
  const controlSize = isTouchLayout ? "touch" : "field";

  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      transfer.items.map((item) => [
        item.ingredientId,
        String(item.reversibleQty ?? item.qty),
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  function fillAll() {
    setQuantities(
      Object.fromEntries(
        transfer.items
          .filter((item) => (item.reversibleQty ?? item.qty) > 0)
          .map((item) => [
            item.ingredientId,
            formatIssueMaxEntryQuantity(item.reversibleQty ?? item.qty),
          ]),
      ),
    );
    idempotencyKey.current = null;
  }

  function submit() {
    let invalidIngredient: string | null = null;
    const lines = transfer.items.flatMap((item) => {
      const quantity = positiveQuantity(quantities[item.ingredientId]);
      if (quantity == null) return [];
      const remaining = item.reversibleQty ?? item.qty;
      if (quantity > remaining) {
        invalidIngredient ??= item.name;
        return [];
      }
      return [
        {
          ingredientId: item.ingredientId,
          quantity,
          entryUnitId: item.entryUnitId,
        },
      ];
    });
    if (invalidIngredient) {
      toast.error(copy.reverse.quantityExceedsRemaining(invalidIngredient));
      return;
    }
    if (lines.length === 0) {
      toast.error(copy.reverse.lineRequired);
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await reverseIntraSiteTransfer({
        transferId: transfer.id,
        lines,
        notes,
        idempotencyKey: idempotencyKey.current!,
      });
      if (!result.success) {
        toast.error(result.error ?? copy.reverse.failed);
        return;
      }
      toast.success(copy.reverse.success);
      setOpen(false);
      idempotencyKey.current = null;
      router.refresh();
    });
  }

  const hasRemaining = transfer.items.some(
    (item) => (item.reversibleQty ?? item.qty) > 0,
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerSize}
        onClick={() => setOpen(true)}
        disabled={!hasRemaining}
      >
        <IconRotateCcw data-icon="inline-start" />
        {copy.reverse.trigger}
      </Button>
      <AppDialog
        variant="document"
        open={open}
        onOpenChange={setOpen}
        title={copy.reverse.title(transfer.code)}
        description={copy.reverse.description}
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              {copy.close}
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              {copy.reverse.submit}
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">{copy.reverse.description}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fillAll}
              disabled={!hasRemaining}
            >
              {copy.transferAll}
            </Button>
          </div>
          <ScrollArea className="h-80">
            <div className="flex flex-col gap-2 pr-2">
              {transfer.items.map((item) => {
                const remaining = item.reversibleQty ?? item.qty;
                const maxQuantityValue =
                  remaining > 0
                    ? formatIssueMaxEntryQuantity(remaining)
                    : null;
                return (
                  <Item
                    key={item.ingredientId}
                    variant="outline"
                    size="sm"
                    className="w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-between"
                  >
                    <ItemContent className="w-full min-w-0 flex-1 sm:w-auto">
                      <ItemTitle className="truncate">{item.name}</ItemTitle>
                      <ItemDescription>
                        {copy.reverse.remainingQuantity(remaining, item.unit)}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="flex w-full items-center justify-between gap-2 sm:w-auto sm:shrink-0">
                      <InputGroup
                        size={controlSize}
                        className="col-span-2 w-full sm:w-40"
                      >
                        <QuantityInput
                          value={quantities[item.ingredientId] ?? ""}
                          onValueChange={(value) => {
                            setQuantities((current) => ({
                              ...current,
                              [item.ingredientId]: clampIssueEntryQuantity(
                                value,
                                remaining,
                              ),
                            }));
                            idempotencyKey.current = null;
                          }}
                          maxFractionDigits={3}
                          disabled={remaining <= 0}
                          placeholder="0"
                          aria-label={copy.reverse.quantityAria(item.name)}
                          className="h-full"
                        />
                        {maxQuantityValue ? (
                          <InputGroupAddon
                            align="inline-end"
                            className="py-0"
                          >
                            <Button
                              type="button"
                              variant="ghost"
                              size={isTouchLayout ? "touch" : "sm"}
                              className="shadow-none"
                              onClick={() => {
                                setQuantities((current) => ({
                                  ...current,
                                  [item.ingredientId]: maxQuantityValue,
                                }));
                                idempotencyKey.current = null;
                              }}
                            >
                              {FORM_VI.max}
                            </Button>
                          </InputGroupAddon>
                        ) : null}
                      </InputGroup>
                      <Input
                        controlSize={controlSize}
                        className="w-full sm:w-20"
                        value={item.unit}
                        readOnly
                        aria-readonly="true"
                      />
                    </ItemActions>
                  </Item>
                );
              })}
            </div>
          </ScrollArea>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder={copy.reverse.notesPlaceholder}
            aria-label={copy.reverse.notesAria}
          />
        </div>
      </AppDialog>
    </>
  );
}
