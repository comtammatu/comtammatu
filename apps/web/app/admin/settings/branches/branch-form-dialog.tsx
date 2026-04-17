"use client";

import { z } from "zod";
import {
  FormDialog,
  SelectField,
  TextField,
  valuesToFormData,
} from "@/components/form";
import { FieldDescription, FieldLabel } from "@comtammatu/ui/components/field";
import { createBranch, updateBranch } from "./actions";
import type { BranchRow } from "./branch-table";

const BRANCH_KIND_OPTIONS = [
  { value: "branch", label: "Chi nhánh" },
  { value: "central_kitchen", label: "Bếp trung tâm" },
] as const;

const branchSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Tên điểm vận hành không được trống" }),
  address: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  branchKind: z.enum(["branch", "central_kitchen", "warehouse"]),
});

type BranchFormValues = z.infer<typeof branchSchema>;

function toFormValues(branch: BranchRow | null | undefined): BranchFormValues {
  const kind: BranchFormValues["branchKind"] =
    branch?.branch_kind === "central_kitchen"
      ? "central_kitchen"
      : branch?.branch_kind === "warehouse"
        ? "warehouse"
        : "branch";
  return {
    name: branch?.name ?? "",
    address: branch?.address ?? "",
    phone: branch?.phone ?? "",
    branchKind: kind,
  };
}

interface BranchFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch?: BranchRow | null;
}

export function BranchFormDialog({
  open,
  onOpenChange,
  branch,
}: BranchFormDialogProps) {
  const isEdit = !!branch;
  const isHeadquarters = branch?.is_headquarters === true;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      schema={branchSchema}
      defaultValues={toFormValues(branch)}
      entityKey={branch?.id ?? "new"}
      title={isEdit ? "Chỉnh sửa điểm vận hành" : "Thêm điểm vận hành mới"}
      successMessage={
        isEdit ? "Đã cập nhật điểm vận hành" : "Đã tạo điểm vận hành mới"
      }
      submitLabel={isEdit ? "Cập nhật" : "Tạo mới"}
      onSubmit={async (values) => {
        const fd = valuesToFormData(values);
        if (isEdit && branch) {
          fd.set("id", String(branch.id));
          return updateBranch(null, fd);
        }
        return createBranch(null, fd);
      }}
    >
      {(form) => (
        <>
          <TextField
            control={form.control}
            name="name"
            label="Tên điểm vận hành"
            placeholder="VD: Chi nhánh Quận 1 hoặc Bếp trung tâm"
            required
          />
          <TextField
            control={form.control}
            name="address"
            label="Địa chỉ"
            placeholder="VD: 123 Nguyễn Huệ, Quận 1"
          />
          <TextField
            control={form.control}
            name="phone"
            label="Điện thoại"
            type="tel"
            placeholder="VD: 028 1234 5678"
          />
          {isHeadquarters ? (
            <div>
              <FieldLabel>Loại điểm vận hành</FieldLabel>
              <FieldDescription>
                Trụ sở được gán bằng nút &quot;Đặt làm trụ sở chính&quot;.
              </FieldDescription>
            </div>
          ) : (
            <SelectField
              control={form.control}
              name="branchKind"
              label="Loại điểm vận hành"
              options={BRANCH_KIND_OPTIONS}
              placeholder="Chọn loại"
            />
          )}
        </>
      )}
    </FormDialog>
  );
}
