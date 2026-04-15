"use client";

import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { createCategory, updateCategory } from "./actions";
import { CATEGORY_TYPE_LABELS } from "./category-labels";
import type { CategoryRow } from "./category-table";
import { CrudDialog } from "../../components/v2/crud-dialog";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: CategoryRow | null;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
}: CategoryFormDialogProps) {
  const isEdit = !!category;

  return (
    <CrudDialog
      open={open}
      onOpenChange={onOpenChange}
      action={isEdit ? updateCategory : createCategory}
      entityKey={category?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"}
      successMessage={isEdit ? "Đã cập nhật danh mục" : "Đã tạo danh mục mới"}
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
    >
      {isEdit && <input type="hidden" name="id" value={category.id} />}

      <div className="space-y-2">
        <Label htmlFor="name">Tên danh mục *</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={category?.name ?? ""}
          placeholder="VD: Cơm tấm, Nước uống"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Loại *</Label>
        <Select
          name="type"
          defaultValue={category?.type ?? "main_dish"}
          required
        >
          <SelectTrigger id="type">
            <SelectValue placeholder="Chọn loại" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="sort_order">Thứ tự hiển thị</Label>
        <Input
          id="sort_order"
          name="sort_order"
          type="number"
          min={0}
          defaultValue={category?.sort_order ?? 0}
        />
      </div>
    </CrudDialog>
  );
}
