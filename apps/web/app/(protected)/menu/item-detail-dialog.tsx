"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Plus as IconPlus, Trash as IconTrash } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { Item, ItemGroup } from "@comtammatu/ui/components/item";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { saveVariants, saveModifiers, saveSides } from "./actions";
import { SIDE_DISH_TYPE } from "./category-labels";
import { toast } from "@comtammatu/ui/components/sonner";
import { createClient } from "@comtammatu/database/supabase/client";
import type { ItemRow } from "./item-table";
import { AppEmptyState } from "@/components/surface";
import { AppDialog } from "@/components/form/form-dialog";
import { WholeVndInput } from "@/components/form";

import { FORM_VI, MENU_VI } from "@comtammatu/shared/messages";

interface VariantEntry {
  id?: number;
  name: string;
  price_adjustment: number;
  sort_order: number;
}

interface ModifierEntry {
  id?: number;
  name: string;
  price: number;
  sort_order: number;
}

interface SideEntry {
  side_item_id: number;
  side_item_name: string;
  is_default: boolean;
}

interface ItemDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ItemRow | null;
  allItems: ItemRow[];
}

export function ItemDetailDialog({
  open,
  onOpenChange,
  item,
  allItems,
}: ItemDetailDialogProps) {
  const [variants, setVariants] = useState<VariantEntry[]>([]);
  const [modifiers, setModifiers] = useState<ModifierEntry[]>([]);
  const [sides, setSides] = useState<SideEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const checkboxIdPrefix = useId();
  const loadTokenRef = useRef(0);

  const sideItems = allItems.filter(
    (i) => i.category_type === SIDE_DISH_TYPE && i.id !== item?.id,
  );

  const loadItemDetails = useCallback(async (itemId: number) => {
    const token = ++loadTokenRef.current;
    setIsLoading(true);
    setLoadError(null);
    const supabase = createClient();

    const [varRes, modRes, sideRes] = await Promise.all([
      supabase
        .from("menu_item_variants")
        .select("id, name, price_adjustment, sort_order")
        .eq("item_id", itemId)
        .order("sort_order"),
      supabase
        .from("menu_item_modifiers")
        .select("id, name, price, sort_order")
        .eq("item_id", itemId)
        .order("sort_order"),
      supabase
        .from("menu_item_available_sides")
        .select(
          "side_item_id, is_default, menu_items!menu_item_available_sides_side_item_id_fkey(name)",
        )
        .eq("main_item_id", itemId),
    ]);

    if (token !== loadTokenRef.current) return;

    if (varRes.error || modRes.error || sideRes.error) {
      setLoadError(MENU_VI.loadDataFailedRetry);
      setIsLoading(false);
      return;
    }

    setVariants(varRes.data ?? []);
    setModifiers(modRes.data ?? []);
    setSides(
      (sideRes.data ?? []).map((s) => ({
        side_item_id: s.side_item_id,
        side_item_name: s.menu_items?.name ?? "—",
        is_default: s.is_default,
      })),
    );
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (open && item) {
      loadItemDetails(item.id);
    }
    if (!open) {
      loadTokenRef.current++;
      setVariants([]);
      setModifiers([]);
      setSides([]);
    }
  }, [open, item, loadItemDetails]);

  function addVariant() {
    setVariants((prev) => {
      const next = [...prev, { name: "", price_adjustment: 0, sort_order: 0 }];
      return next.map((v, i) => ({ ...v, sort_order: i }));
    });
  }

  function removeVariant(idx: number) {
    setVariants((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((v, i) => ({ ...v, sort_order: i }));
    });
  }

  function updateVariant(
    idx: number,
    field: keyof VariantEntry,
    value: string | number,
  ) {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)),
    );
  }

  function handleSaveVariants() {
    if (!item) return;
    const valid = variants
      .filter((v) => v.name.trim() !== "")
      .map((v, i) => ({ ...v, sort_order: i }));
    startTransition(async () => {
      const result = await saveVariants({ itemId: item.id, variants: valid });
      if (result.success) {
        toast.success(MENU_VI.variantsSaved);
      } else {
        toast.error(result.error);
      }
    });
  }

  function addModifier() {
    setModifiers((prev) => {
      const next = [...prev, { name: "", price: 0, sort_order: 0 }];
      return next.map((m, i) => ({ ...m, sort_order: i }));
    });
  }

  function removeModifier(idx: number) {
    setModifiers((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((m, i) => ({ ...m, sort_order: i }));
    });
  }

  function updateModifier(
    idx: number,
    field: keyof ModifierEntry,
    value: string | number,
  ) {
    setModifiers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );
  }

  function handleSaveModifiers() {
    if (!item) return;
    const valid = modifiers
      .filter((m) => m.name.trim() !== "")
      .map((m, i) => ({ ...m, sort_order: i }));
    startTransition(async () => {
      const result = await saveModifiers({ itemId: item.id, modifiers: valid });
      if (result.success) {
        toast.success(MENU_VI.modifiersSaved);
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleSide(sideItemId: number, sideItemName: string) {
    setSides((prev) => {
      const exists = prev.find((s) => s.side_item_id === sideItemId);
      if (exists) {
        return prev.filter((s) => s.side_item_id !== sideItemId);
      }
      return [
        ...prev,
        {
          side_item_id: sideItemId,
          side_item_name: sideItemName,
          is_default: false,
        },
      ];
    });
  }

  function toggleSideDefault(sideItemId: number) {
    setSides((prev) =>
      prev.map((s) =>
        s.side_item_id === sideItemId ? { ...s, is_default: !s.is_default } : s,
      ),
    );
  }

  function handleSaveSides() {
    if (!item) return;
    startTransition(async () => {
      const result = await saveSides({
        mainItemId: item.id,
        sideItemIds: sides.map((s) => ({
          id: s.side_item_id,
          is_default: s.is_default,
        })),
      });
      if (result.success) {
        toast.success(MENU_VI.sidesSaved);
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!item) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={MENU_VI.itemDetailTitle(item.name)}
    >
      {isLoading ? (
        <div className="flex min-h-16 items-center justify-center">
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="variants" className="w-full">
          <TabsList size="touch" className="w-full">
            <TabsTrigger value="variants" className="flex-1">
              {MENU_VI.variantsTab} ({variants.length})
            </TabsTrigger>
            <TabsTrigger value="modifiers" className="flex-1">
              {MENU_VI.modifiersTab} ({modifiers.length})
            </TabsTrigger>
            <TabsTrigger value="sides" className="flex-1">
              {MENU_VI.sidesTab} ({sides.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="variants" className="flex flex-col gap-3">
            {variants.map((v, idx) => (
              <div key={v.id ?? `new-${idx}`} className="flex items-end gap-2">
                <Field className="min-w-0 flex-1 gap-1">
                  <FieldLabel className="text-xs">{FORM_VI.name}</FieldLabel>
                  <Input
                    value={v.name}
                    onChange={(e) => updateVariant(idx, "name", e.target.value)}
                    placeholder={MENU_VI.variantNamePlaceholder}
                  />
                </Field>
                <Field className="w-28 shrink-0 gap-1">
                  <FieldLabel className="text-xs">
                    {MENU_VI.priceDeltaLabel}
                  </FieldLabel>
                  <WholeVndInput
                    defaultValue={String(v.price_adjustment)}
                    allowNegative
                    key={v.id ?? `price-${idx}`}
                    onValueBlur={(value) => {
                      const num = Number(value);
                      if (!Number.isNaN(num)) {
                        updateVariant(idx, "price_adjustment", num);
                      }
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeVariant(idx)}
                >
                  <IconTrash className="size-4" />
                  <span className="sr-only">{MENU_VI.removeVariant}</span>
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addVariant}
              >
                <IconPlus className="mr-1 size-3" />
                {MENU_VI.addVariant}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveVariants}
                disabled={isPending}
              >
                {isPending && <Spinner className="mr-1 size-3" />}
                {MENU_VI.saveVariants}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="modifiers" className="flex flex-col gap-3">
            {modifiers.map((m, idx) => (
              <div key={m.id ?? `new-${idx}`} className="flex items-end gap-2">
                <Field className="min-w-0 flex-1 gap-1">
                  <FieldLabel className="text-xs">{FORM_VI.name}</FieldLabel>
                  <Input
                    value={m.name}
                    onChange={(e) =>
                      updateModifier(idx, "name", e.target.value)
                    }
                    placeholder={MENU_VI.modifierNamePlaceholder}
                  />
                </Field>
                <Field className="w-28 shrink-0 gap-1">
                  <FieldLabel className="text-xs">{FORM_VI.price}</FieldLabel>
                  <WholeVndInput
                    defaultValue={String(m.price)}
                    key={m.id ?? `mod-price-${idx}`}
                    onValueBlur={(value) => {
                      const num = Number(value);
                      if (!Number.isNaN(num)) {
                        updateModifier(idx, "price", num);
                      }
                    }}
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeModifier(idx)}
                >
                  <IconTrash className="size-4" />
                  <span className="sr-only">{MENU_VI.removeModifier}</span>
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addModifier}
              >
                <IconPlus className="mr-1 size-3" />
                {MENU_VI.addModifier}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveModifiers}
                disabled={isPending}
              >
                {isPending && <Spinner className="mr-1 size-3" />}
                {MENU_VI.saveModifiers}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sides" className="flex flex-col gap-3">
            {sideItems.length === 0 ? (
              <AppEmptyState
                compact
                className="bg-transparent"
                title={MENU_VI.sidesEmptyTitle}
                description={MENU_VI.sidesEmptyDescription}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  {MENU_VI.sidesSelectHint}
                </p>
                <ItemGroup className="gap-2">
                  {sideItems.map((si) => {
                    const selected = sides.find(
                      (s) => s.side_item_id === si.id,
                    );
                    const sideCheckboxId = `${checkboxIdPrefix}-item-${item.id}-side-${si.id}`;
                    const defaultCheckboxId = `${checkboxIdPrefix}-item-${item.id}-default-side-${si.id}`;

                    return (
                      <Item
                        key={si.id}
                        variant="outline"
                        size="sm"
                        className="justify-between"
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Checkbox
                            id={sideCheckboxId}
                            checked={!!selected}
                            onCheckedChange={() => toggleSide(si.id, si.name)}
                          />
                          <FieldLabel
                            htmlFor={sideCheckboxId}
                            className="min-w-0 flex-1 truncate text-sm font-normal"
                          >
                            {si.name}
                          </FieldLabel>
                        </div>
                        {selected && (
                          <div className="flex shrink-0 items-center gap-1">
                            <Checkbox
                              id={defaultCheckboxId}
                              checked={selected.is_default}
                              onCheckedChange={() => toggleSideDefault(si.id)}
                            />
                            <FieldLabel
                              htmlFor={defaultCheckboxId}
                              className="text-xs font-normal text-muted-foreground"
                            >
                              {MENU_VI.sideDefault}
                            </FieldLabel>
                          </div>
                        )}
                      </Item>
                    );
                  })}
                </ItemGroup>
              </>
            )}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                size="sm"
                onClick={handleSaveSides}
                disabled={isPending}
              >
                {isPending && <Spinner className="mr-1 size-3" />}
                {MENU_VI.saveSides}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </AppDialog>
  );
}
