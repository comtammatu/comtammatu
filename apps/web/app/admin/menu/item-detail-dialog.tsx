"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { saveVariants, saveModifiers, saveSides } from "./actions";
import { toast } from "@comtammatu/ui/components/sonner";
import { createClient } from "@comtammatu/database/supabase/client";
import type { ItemRow } from "./item-table";

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
  const [isPending, startTransition] = useTransition();

  // Side dish items (from categories with type "side_dish")
  const sideItems = allItems.filter(
    (i) => i.category_type === "side_dish" && i.id !== item?.id,
  );

  const loadItemDetails = useCallback(async (itemId: number) => {
    setIsLoading(true);
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
        .select("side_item_id, is_default, menu_items!menu_item_available_sides_side_item_id_fkey(name)")
        .eq("main_item_id", itemId),
    ]);

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
      setVariants([]);
      setModifiers([]);
      setSides([]);
    }
  }, [open, item, loadItemDetails]);

  /* ─── Variant Handlers ─── */

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { name: "", price_adjustment: 0, sort_order: prev.length },
    ]);
  }

  function removeVariant(idx: number) {
    setVariants((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateVariant(idx: number, field: keyof VariantEntry, value: string | number) {
    setVariants((prev) =>
      prev.map((v, i) => (i === idx ? { ...v, [field]: value } : v)),
    );
  }

  function handleSaveVariants() {
    if (!item) return;
    const valid = variants.filter((v) => v.name.trim() !== "");
    startTransition(async () => {
      const result = await saveVariants(item.id, valid);
      if (result.success) {
        toast.success("Đã lưu biến thể");
      } else {
        toast.error(result.error);
      }
    });
  }

  /* ─── Modifier Handlers ─── */

  function addModifier() {
    setModifiers((prev) => [
      ...prev,
      { name: "", price: 0, sort_order: prev.length },
    ]);
  }

  function removeModifier(idx: number) {
    setModifiers((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateModifier(idx: number, field: keyof ModifierEntry, value: string | number) {
    setModifiers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)),
    );
  }

  function handleSaveModifiers() {
    if (!item) return;
    const valid = modifiers.filter((m) => m.name.trim() !== "");
    startTransition(async () => {
      const result = await saveModifiers(item.id, valid);
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
      return [...prev, { side_item_id: sideItemId, side_item_name: sideItemName, is_default: false }];
    });
  }

  function toggleSideDefault(sideItemId: number) {
    setSides((prev) =>
      prev.map((s) =>
        s.side_item_id === sideItemId
          ? { ...s, is_default: !s.is_default }
          : s,
      ),
    );
  }

  function handleSaveSides() {
    if (!item) return;
    startTransition(async () => {
      const result = await saveSides(
        item.id,
        sides.map((s) => ({ id: s.side_item_id, is_default: s.is_default })),
      );
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
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item.name} — Chi tiết</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
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
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Tên</Label>
                    <Input
                      value={v.name}
                      onChange={(e) => updateVariant(idx, "name", e.target.value)}
                      placeholder="VD: Phần lớn"
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs">+/- Giá</Label>
                    <Input
                      type="number"
                      value={v.price_adjustment}
                      onChange={(e) =>
                        updateVariant(idx, "price_adjustment", Number(e.target.value))
                      }
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
                  {isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
                  Lưu biến thể
                </Button>
              </div>
            </TabsContent>

            {/* ─── Modifiers Tab ─── */}
            <TabsContent value="modifiers" className="space-y-3 mt-4">
              {modifiers.map((m, idx) => (
                <div key={idx} className="flex items-end gap-2">
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
                      value={m.price}
                      onChange={(e) =>
                        updateModifier(idx, "price", Number(e.target.value))
                      }
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
                  {isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
                  Lưu tùy chọn
                </Button>
              </div>
            </TabsContent>

            {/* ─── Sides Tab ─── */}
            <TabsContent value="sides" className="space-y-3 mt-4">
              {sideItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Chưa có món phụ nào. Tạo danh mục loại &quot;Món phụ&quot; và
                  thêm món trước.
                </p>
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
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={!!selected}
                            onCheckedChange={() => toggleSide(si.id, si.name)}
                          />
                          <span className="text-sm">{si.name}</span>
                        </div>
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
                  {isPending && <Loader2 className="mr-1 size-3 animate-spin" />}
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
