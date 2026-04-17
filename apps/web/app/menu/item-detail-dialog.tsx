"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
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
import { EmptyStatePanel } from "@/admin/components/empty-state-panel";

/* ─── Local Types ─── */

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
  const loadTokenRef = useRef(0);

  // Side dish items (from categories with type "side_dish")
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
      setLoadError("Không thể tải dữ liệu. Vui lòng thử lại.");
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

  /* ─── Variant Handlers ─── */

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
        toast.success("Đã lưu biến thể");
      } else {
        toast.error(result.error);
      }
    });
  }

  /* ─── Modifier Handlers ─── */

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
        toast.success("Đã lưu tùy chọn");
      } else {
        toast.error(result.error);
      }
    });
  }

  /* ─── Sides Handlers ─── */

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
        sideItemIds: sides.map((s) => ({ id: s.side_item_id, is_default: s.is_default })),
      });
      if (result.success) {
        toast.success("Đã lưu món ăn kèm");
      } else {
        toast.error(result.error);
      }
    });
  }

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg overflow-y-auto"
        style={{ maxHeight: "80vh" }}
      >
        <DialogHeader>
          <DialogTitle>{item.name} — Chi tiết</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : (
          <Tabs defaultValue="variants" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="variants" className="flex-1">
                Biến thể ({variants.length})
              </TabsTrigger>
              <TabsTrigger value="modifiers" className="flex-1">
                Tùy chọn ({modifiers.length})
              </TabsTrigger>
              <TabsTrigger value="sides" className="flex-1">
                Món kèm ({sides.length})
              </TabsTrigger>
            </TabsList>

            {/* ─── Variants Tab ─── */}
            <TabsContent value="variants" className="space-y-3 mt-4">
              {variants.map((v, idx) => (
                <div
                  key={v.id ?? `new-${idx}`}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tên</Label>
                    <Input
                      value={v.name}
                      onChange={(e) =>
                        updateVariant(idx, "name", e.target.value)
                      }
                      placeholder="VD: Phần lớn"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">+/- Giá</Label>
                    <Input
                      type="number"
                      defaultValue={v.price_adjustment}
                      key={v.id ?? `price-${idx}`}
                      onBlur={(e) => {
                        const num = Number(e.target.value);
                        if (!Number.isNaN(num)) {
                          updateVariant(idx, "price_adjustment", num);
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => removeVariant(idx)}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Xóa biến thể</span>
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
                  <Plus className="mr-1 size-3" />
                  Thêm biến thể
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveVariants}
                  disabled={isPending}
                >
                  {isPending && (
                    <Spinner className="mr-1 size-3" />
                  )}
                  Lưu biến thể
                </Button>
              </div>
            </TabsContent>

            {/* ─── Modifiers Tab ─── */}
            <TabsContent value="modifiers" className="space-y-3 mt-4">
              {modifiers.map((m, idx) => (
                <div
                  key={m.id ?? `new-${idx}`}
                  className="flex items-end gap-2"
                >
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tên</Label>
                    <Input
                      value={m.name}
                      onChange={(e) =>
                        updateModifier(idx, "name", e.target.value)
                      }
                      placeholder="VD: Thêm trứng"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">Giá</Label>
                    <Input
                      type="number"
                      min={0}
                      defaultValue={m.price}
                      key={m.id ?? `mod-price-${idx}`}
                      onBlur={(e) => {
                        const num = Number(e.target.value);
                        if (!Number.isNaN(num)) {
                          updateModifier(idx, "price", num);
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0"
                    onClick={() => removeModifier(idx)}
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">Xóa tùy chọn</span>
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
                  <Plus className="mr-1 size-3" />
                  Thêm tùy chọn
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveModifiers}
                  disabled={isPending}
                >
                  {isPending && (
                    <Spinner className="mr-1 size-3" />
                  )}
                  Lưu tùy chọn
                </Button>
              </div>
            </TabsContent>

            {/* ─── Sides Tab ─── */}
            <TabsContent value="sides" className="space-y-3 mt-4">
              {sideItems.length === 0 ? (
                <EmptyStatePanel
                  className="bg-transparent py-6"
                  title="Chưa có món phụ nào"
                  description='Tạo danh mục loại "Món phụ" và thêm món trước.'
                />
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Chọn các món phụ có thể đi kèm:
                  </p>
                  {sideItems.map((si) => {
                    const selected = sides.find(
                      (s) => s.side_item_id === si.id,
                    );
                    return (
                      <div
                        key={si.id}
                        className="flex items-center justify-between rounded-md border p-2"
                      >
                        <label className="flex items-center gap-2">
                          <Checkbox
                            checked={!!selected}
                            onCheckedChange={() => toggleSide(si.id, si.name)}
                          />
                          <span className="text-sm">{si.name}</span>
                        </label>
                        {selected && (
                          <label className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Checkbox
                              checked={selected.is_default}
                              onCheckedChange={() => toggleSideDefault(si.id)}
                            />
                            Mặc định
                          </label>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              <div className="flex justify-end pt-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveSides}
                  disabled={isPending}
                >
                  {isPending && (
                    <Spinner className="mr-1 size-3" />
                  )}
                  Lưu món kèm
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
