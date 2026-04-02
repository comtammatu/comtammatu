"use client";

import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Switch } from "@comtammatu/ui/components/switch";
import type { Category, MenuItem } from "./actions";
import { createMenuItem, updateMenuItem } from "./actions";

const schema = z.object({
  name: z.string().min(1, { error: "Tên món không được để trống" }),
  description: z.string().optional(),
  base_price: z.number().min(0, { error: "Giá không hợp lệ" }),
  category_id: z.number().int().positive({ error: "Vui lòng chọn danh mục" }),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItem | null;
  categories: Category[];
  defaultCategoryId?: number;
  onCreated: (item: MenuItem) => void;
  onUpdated: (item: MenuItem) => void;
}

export function MenuItemForm({
  open,
  onOpenChange,
  item,
  categories,
  defaultCategoryId,
  onCreated,
  onUpdated,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      base_price: 0,
      category_id: defaultCategoryId ?? 0,
      sort_order: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: item?.name ?? "",
        description: item?.description ?? "",
        base_price: item?.base_price ?? 0,
        category_id: item?.category_id ?? defaultCategoryId ?? 0,
        sort_order: item?.sort_order ?? 0,
        is_active: item?.is_active ?? true,
      });
    }
  }, [open, item, defaultCategoryId, reset]);

  const isActive = watch("is_active");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      if (item) {
        const result = await updateMenuItem(item.id, values);
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Không thể cập nhật món ăn");
          return;
        }
        toast.success("Đã cập nhật món ăn");
        onUpdated(result.data);
      } else {
        const result = await createMenuItem(values);
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Không thể tạo món ăn");
          return;
        }
        toast.success("Đã tạo món ăn");
        onCreated(result.data);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Sửa món ăn" : "Thêm món ăn"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item-name">Tên món</Label>
            <Input
              id="item-name"
              placeholder="Ví dụ: Cơm tấm sườn bì chả..."
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-desc">Mô tả</Label>
            <textarea
              id="item-desc"
              rows={2}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
              placeholder="Mô tả ngắn về món ăn..."
              {...register("description")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="item-price">Giá (đồng)</Label>
              <Input
                id="item-price"
                type="number"
                min={0}
                step={500}
                {...register("base_price", { valueAsNumber: true })}
              />
              {errors.base_price && (
                <p className="text-xs text-destructive">{errors.base_price.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="item-sort">Thứ tự</Label>
              <Input
                id="item-sort"
                type="number"
                min={0}
                {...register("sort_order", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="item-category">Danh mục</Label>
            <select
              id="item-category"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              {...register("category_id", { valueAsNumber: true })}
            >
              <option value={0}>-- Chọn danh mục --</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            {errors.category_id && (
              <p className="text-xs text-destructive">{errors.category_id.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="item-active">Hiển thị món</Label>
            <Switch
              id="item-active"
              checked={isActive}
              onCheckedChange={(val) => setValue("is_active", val)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Đang lưu..." : item ? "Lưu thay đổi" : "Tạo món ăn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
