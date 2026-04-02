"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createItem, updateItem } from "./actions";
import { toast } from "@comtammatu/ui/components/sonner";
import type { CategoryRow } from "./category-table";
import type { ItemRow } from "./item-table";

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: ItemRow | null;
  categories: CategoryRow[];
}

export function ItemFormDialog({
  open,
  onOpenChange,
  item,
  categories,
}: ItemFormDialogProps) {
  const isEdit = !!item;
  const action = isEdit ? updateItem : createItem;
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      onOpenChange(false);
      toast.success(isEdit ? "Đã cập nhật món" : "Đã tạo món mới");
    }
  }, [state, isEdit, onOpenChange]);

  const activeCategories = categories.filter((c) => c.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Chỉnh sửa món" : "Thêm món mới"}</DialogTitle>
        </DialogHeader>

        <form ref={formRef} action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={item.id} />}

          <div className="space-y-2">
            <Label htmlFor="name">Tên món *</Label>
            <Input
              id="name"
              name="name"
              required
              defaultValue={item?.name ?? ""}
              placeholder="VD: Cơm sườn cốt lết"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category_id">Danh mục *</Label>
            <Select
              name="category_id"
              defaultValue={item?.category_id?.toString() ?? ""}
              required
            >
              <SelectTrigger id="category_id">
                <SelectValue placeholder="Chọn danh mục" />
              </SelectTrigger>
              <SelectContent>
                {activeCategories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="base_price">Giá gốc (VND) *</Label>
            <Input
              id="base_price"
              name="base_price"
              type="number"
              min={0}
              step={1000}
              required
              defaultValue={item?.base_price ?? ""}
              placeholder="35000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Textarea
              id="description"
              name="description"
              rows={2}
              defaultValue={item?.description ?? ""}
              placeholder="Mô tả ngắn về món ăn"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isEdit ? "Cập nhật" : "Tạo mới"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
