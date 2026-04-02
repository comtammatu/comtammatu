"use client";

import { useState, useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@comtammatu/ui/components/alert-dialog";
import { formatVND } from "@comtammatu/shared/format";
import type { MenuItem, Variant, Modifier, AvailableSide, ItemDetails } from "./actions";
import {
  getItemDetails,
  upsertVariant,
  deleteVariant,
  upsertModifier,
  deleteModifier,
  updateAvailableSides,
} from "./actions";

const variantSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1, { error: "Tên biến thể không được để trống" }),
  price_adjustment: z.number(),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
});

const modifierSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().min(1, { error: "Tên topping không được để trống" }),
  price: z.number().min(0),
  is_default: z.boolean(),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
});

type VariantFormValues = z.infer<typeof variantSchema>;
type ModifierFormValues = z.infer<typeof modifierSchema>;

interface Props {
  item: MenuItem;
  items: MenuItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onItemUpdated: (item: MenuItem) => void;
}

function VariantRow({
  variant,
  itemId,
  onSaved,
  onDeleted,
}: {
  variant: Variant;
  itemId: number;
  onSaved: (v: Variant) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, setValue, watch, reset } =
    useForm<VariantFormValues>({
      resolver: zodResolver(variantSchema),
      defaultValues: {
        id: variant.id,
        name: variant.name,
        price_adjustment: variant.price_adjustment,
        sort_order: variant.sort_order,
        is_active: variant.is_active,
      },
    });

  const isActive = watch("is_active");

  function onSubmit(values: VariantFormValues) {
    startTransition(async () => {
      const result = await upsertVariant(itemId, values);
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Không thể lưu biến thể");
        return;
      }
      toast.success("Đã lưu biến thể");
      onSaved(result.data);
      setEditing(false);
    });
  }

  if (!editing) {
    const adj = variant.price_adjustment;
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{variant.name}</span>
          <span className={`text-xs ${adj >= 0 ? "text-green-600" : "text-red-600"}`}>
            {adj >= 0 ? "+" : ""}{formatVND(adj)}
          </span>
          {!variant.is_active && <Badge variant="secondary" className="text-xs">Ẩn</Badge>}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted">
            <Pencil className="size-3.5" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="p-1 rounded hover:bg-muted">
                <Trash2 className="size-3.5 text-destructive" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa biến thể?</AlertDialogTitle>
                <AlertDialogDescription>Xóa &ldquo;{variant.name}&rdquo;?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteVariant(variant.id);
                      if (!result.success) { toast.error(result.error); return; }
                      toast.success("Đã xóa biến thể");
                      onDeleted(variant.id);
                    });
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Xóa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="py-2 space-y-2 border-b last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Tên biến thể" {...register("name")} />
        <Input type="number" step={500} placeholder="Điều chỉnh giá" {...register("price_adjustment", { valueAsNumber: true })} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id={`var-active-${variant.id}`}
            checked={isActive}
            onCheckedChange={(val) => setValue("is_active", val)}
          />
          <Label htmlFor={`var-active-${variant.id}`} className="text-xs">Hiển thị</Label>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-7" type="submit" disabled={isPending}>
            <Check className="size-4 text-green-600" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            type="button"
            onClick={() => { reset(); setEditing(false); }}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

function NewVariantRow({
  itemId,
  onSaved,
  onCancel,
}: {
  itemId: number;
  onSaved: (v: Variant) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, setValue, watch } = useForm<VariantFormValues>({
    resolver: zodResolver(variantSchema),
    defaultValues: { name: "", price_adjustment: 0, sort_order: 0, is_active: true },
  });
  const isActive = watch("is_active");

  function onSubmit(values: VariantFormValues) {
    startTransition(async () => {
      const result = await upsertVariant(itemId, values);
      if (!result.success || !result.data) { toast.error(result.error); return; }
      toast.success("Đã thêm biến thể");
      onSaved(result.data);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="py-2 space-y-2 border-b last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Tên biến thể" {...register("name")} autoFocus />
        <Input type="number" step={500} placeholder="Điều chỉnh giá" {...register("price_adjustment", { valueAsNumber: true })} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Switch id="new-var-active" checked={isActive} onCheckedChange={(val) => setValue("is_active", val)} />
          <Label htmlFor="new-var-active" className="text-xs">Hiển thị</Label>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-7" type="submit" disabled={isPending}>
            <Check className="size-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" type="button" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

function ModifierRow({
  modifier,
  itemId,
  onSaved,
  onDeleted,
}: {
  modifier: Modifier;
  itemId: number;
  onSaved: (m: Modifier) => void;
  onDeleted: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();

  const { register, handleSubmit, setValue, watch, reset } =
    useForm<ModifierFormValues>({
      resolver: zodResolver(modifierSchema),
      defaultValues: {
        id: modifier.id,
        name: modifier.name,
        price: modifier.price,
        is_default: modifier.is_default,
        sort_order: modifier.sort_order,
        is_active: modifier.is_active,
      },
    });

  const isActive = watch("is_active");
  const isDefault = watch("is_default");

  function onSubmit(values: ModifierFormValues) {
    startTransition(async () => {
      const result = await upsertModifier(itemId, values);
      if (!result.success || !result.data) { toast.error(result.error); return; }
      toast.success("Đã lưu topping");
      onSaved(result.data);
      setEditing(false);
    });
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-2 border-b last:border-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{modifier.name}</span>
          <span className="text-xs text-muted-foreground">{formatVND(modifier.price)}</span>
          {modifier.is_default && <Badge variant="outline" className="text-xs">Mặc định</Badge>}
          {!modifier.is_active && <Badge variant="secondary" className="text-xs">Ẩn</Badge>}
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => setEditing(true)} className="p-1 rounded hover:bg-muted">
            <Pencil className="size-3.5" />
          </button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="p-1 rounded hover:bg-muted">
                <Trash2 className="size-3.5 text-destructive" />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa topping?</AlertDialogTitle>
                <AlertDialogDescription>Xóa &ldquo;{modifier.name}&rdquo;?</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteModifier(modifier.id);
                      if (!result.success) { toast.error(result.error); return; }
                      toast.success("Đã xóa topping");
                      onDeleted(modifier.id);
                    });
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Xóa
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="py-2 space-y-2 border-b last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Tên topping" {...register("name")} />
        <Input type="number" step={500} min={0} placeholder="Giá" {...register("price", { valueAsNumber: true })} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch id={`mod-active-${modifier.id}`} checked={isActive} onCheckedChange={(val) => setValue("is_active", val)} />
            <Label htmlFor={`mod-active-${modifier.id}`} className="text-xs">Hiển thị</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id={`mod-default-${modifier.id}`} checked={isDefault} onCheckedChange={(val) => setValue("is_default", val)} />
            <Label htmlFor={`mod-default-${modifier.id}`} className="text-xs">Mặc định</Label>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-7" type="submit" disabled={isPending}>
            <Check className="size-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" type="button" onClick={() => { reset(); setEditing(false); }}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

function NewModifierRow({
  itemId,
  onSaved,
  onCancel,
}: {
  itemId: number;
  onSaved: (m: Modifier) => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const { register, handleSubmit, setValue, watch } = useForm<ModifierFormValues>({
    resolver: zodResolver(modifierSchema),
    defaultValues: { name: "", price: 0, is_default: false, sort_order: 0, is_active: true },
  });
  const isActive = watch("is_active");
  const isDefault = watch("is_default");

  function onSubmit(values: ModifierFormValues) {
    startTransition(async () => {
      const result = await upsertModifier(itemId, values);
      if (!result.success || !result.data) { toast.error(result.error); return; }
      toast.success("Đã thêm topping");
      onSaved(result.data);
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="py-2 space-y-2 border-b last:border-0">
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Tên topping" {...register("name")} autoFocus />
        <Input type="number" step={500} min={0} placeholder="Giá" {...register("price", { valueAsNumber: true })} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Switch id="new-mod-active" checked={isActive} onCheckedChange={(val) => setValue("is_active", val)} />
            <Label htmlFor="new-mod-active" className="text-xs">Hiển thị</Label>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch id="new-mod-default" checked={isDefault} onCheckedChange={(val) => setValue("is_default", val)} />
            <Label htmlFor="new-mod-default" className="text-xs">Mặc định</Label>
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="size-7" type="submit" disabled={isPending}>
            <Check className="size-4 text-green-600" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" type="button" onClick={onCancel}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ItemDetailPanel({ item, items, open, onOpenChange, onItemUpdated }: Props) {
  const [details, setDetails] = useState<ItemDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  const [addingModifier, setAddingModifier] = useState(false);
  const [selectedSideIds, setSelectedSideIds] = useState<number[]>([]);
  const [savingSides, startSavingSides] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getItemDetails(item.id).then((result) => {
      setLoading(false);
      if (result.success && result.data) {
        setDetails(result.data);
        setSelectedSideIds(result.data.available_sides.map((s) => s.side_item_id));
      }
    });
  }, [open, item.id]);

  function handleSaveSides() {
    startSavingSides(async () => {
      const result = await updateAvailableSides(item.id, selectedSideIds);
      if (!result.success) { toast.error(result.error); return; }
      toast.success("Đã lưu món phụ");
    });
  }

  const sideOptions = items.filter((i) => i.id !== item.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{item.name}</SheetTitle>
          <p className="text-2xl font-bold text-primary">{formatVND(item.base_price)}</p>
          {!item.is_active && <Badge variant="secondary">Đang ẩn</Badge>}
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            Đang tải...
          </div>
        ) : details ? (
          <div className="space-y-6">
            {/* Variants */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Biến thể ({details.variants.length})</h3>
                {!addingVariant && (
                  <Button size="sm" variant="outline" onClick={() => setAddingVariant(true)}>
                    <Plus className="size-3.5 mr-1" /> Thêm
                  </Button>
                )}
              </div>
              <div className="rounded-md border px-3">
                {details.variants.length === 0 && !addingVariant && (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Chưa có biến thể nào
                  </p>
                )}
                {details.variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    itemId={item.id}
                    onSaved={(updated) => {
                      setDetails((prev) =>
                        prev
                          ? { ...prev, variants: prev.variants.map((x) => (x.id === updated.id ? updated : x)) }
                          : prev,
                      );
                    }}
                    onDeleted={(id) => {
                      setDetails((prev) =>
                        prev ? { ...prev, variants: prev.variants.filter((x) => x.id !== id) } : prev,
                      );
                    }}
                  />
                ))}
                {addingVariant && (
                  <NewVariantRow
                    itemId={item.id}
                    onSaved={(v) => {
                      setDetails((prev) =>
                        prev ? { ...prev, variants: [...prev.variants, v] } : prev,
                      );
                      setAddingVariant(false);
                    }}
                    onCancel={() => setAddingVariant(false)}
                  />
                )}
              </div>
            </section>

            {/* Modifiers / Toppings */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Topping ({details.modifiers.length})</h3>
                {!addingModifier && (
                  <Button size="sm" variant="outline" onClick={() => setAddingModifier(true)}>
                    <Plus className="size-3.5 mr-1" /> Thêm
                  </Button>
                )}
              </div>
              <div className="rounded-md border px-3">
                {details.modifiers.length === 0 && !addingModifier && (
                  <p className="text-xs text-muted-foreground py-3 text-center">
                    Chưa có topping nào
                  </p>
                )}
                {details.modifiers.map((m) => (
                  <ModifierRow
                    key={m.id}
                    modifier={m}
                    itemId={item.id}
                    onSaved={(updated) => {
                      setDetails((prev) =>
                        prev
                          ? { ...prev, modifiers: prev.modifiers.map((x) => (x.id === updated.id ? updated : x)) }
                          : prev,
                      );
                    }}
                    onDeleted={(id) => {
                      setDetails((prev) =>
                        prev ? { ...prev, modifiers: prev.modifiers.filter((x) => x.id !== id) } : prev,
                      );
                    }}
                  />
                ))}
                {addingModifier && (
                  <NewModifierRow
                    itemId={item.id}
                    onSaved={(m) => {
                      setDetails((prev) =>
                        prev ? { ...prev, modifiers: [...prev.modifiers, m] } : prev,
                      );
                      setAddingModifier(false);
                    }}
                    onCancel={() => setAddingModifier(false)}
                  />
                )}
              </div>
            </section>

            {/* Available Sides */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">Món phụ có thể chọn</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveSides}
                  disabled={savingSides}
                >
                  {savingSides ? "Đang lưu..." : "Lưu"}
                </Button>
              </div>
              {sideOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">Không có món ăn nào khác</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto rounded-md border p-3">
                  {sideOptions.map((side) => (
                    <label
                      key={side.id}
                      className="flex items-center justify-between cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedSideIds.includes(side.id)}
                          onChange={(e) => {
                            setSelectedSideIds((prev) =>
                              e.target.checked
                                ? [...prev, side.id]
                                : prev.filter((id) => id !== side.id),
                            );
                          }}
                        />
                        <span className="text-sm">{side.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatVND(side.base_price)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
