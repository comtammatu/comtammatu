"use client";

import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createItem, updateItem } from "./actions";
import type { CategoryRow } from "./category-table";
import type { ItemRow } from "./item-table";
import { CrudDialog } from "@/components/crud-dialog";

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
  const activeCategories = categories.filter(
    (c) => c.is_active || c.id === item?.category_id,
  );

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateItem : createItem}
      entityKey={item?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa món" : "Thêm món mới"}
      successMessage={isEdit ? "Đã cập nhật món" : "Đã tạo món mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
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
    </CrudDialog>
  );
}
