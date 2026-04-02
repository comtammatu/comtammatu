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
import type { Category } from "./actions";
import { createCategory, updateCategory } from "./actions";

const schema = z.object({
  name: z.string().min(1, { error: "Tên danh mục không được để trống" }),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  onCreated: (cat: Category) => void;
  onUpdated: (cat: Category) => void;
}

export function CategoryForm({
  open,
  onOpenChange,
  category,
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
      sort_order: 0,
      is_active: true,
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? "",
        sort_order: category?.sort_order ?? 0,
        is_active: category?.is_active ?? true,
      });
    }
  }, [open, category, reset]);

  const isActive = watch("is_active");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      if (category) {
        const result = await updateCategory(category.id, values);
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Không thể cập nhật danh mục");
          return;
        }
        toast.success("Đã cập nhật danh mục");
        onUpdated(result.data);
      } else {
        const result = await createCategory(values);
        if (!result.success || !result.data) {
          toast.error(result.error ?? "Không thể tạo danh mục");
          return;
        }
        toast.success("Đã tạo danh mục");
        onCreated(result.data);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {category ? "Sửa danh mục" : "Thêm danh mục"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">Tên danh mục</Label>
            <Input
              id="cat-name"
              placeholder="Ví dụ: Cơm tấm, Nước uống..."
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-sort">Thứ tự hiển thị</Label>
            <Input
              id="cat-sort"
              type="number"
              min={0}
              {...register("sort_order", { valueAsNumber: true })}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="cat-active">Hiển thị danh mục</Label>
            <Switch
              id="cat-active"
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
              {isPending ? "Đang lưu..." : category ? "Lưu thay đổi" : "Tạo danh mục"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
