"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: security role binding surface */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Trash2 } from "lucide-react";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog, FormDialog, SelectField } from "@/components/form";
import { AppSection } from "@/components/surface";
import { setRoleBindingAction } from "./actions";

export type AccessRole = {
  code: string;
  label: string;
  allowedScope: "tenant" | "branch";
};

export type RoleBinding = {
  id: number;
  roleCode: string;
  branchId: number | null;
  grantedAt: string;
};

type Branch = { id: number; name: string };

type Props = {
  targetUserId: string;
  roles: AccessRole[];
  bindings: RoleBinding[];
  branches: Branch[];
  canManage: boolean;
};

const formSchema = z.object({
  roleCode: z.string().min(1, "Chọn vai trò hệ thống."),
  branchId: z.string(),
});

type FormValues = z.infer<typeof formSchema>;

export function RoleBindingsClient({
  targetUserId,
  roles,
  bindings,
  branches,
  canManage,
}: Props) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [revoking, setRevoking] = useState<RoleBinding | null>(null);
  const [isRevoking, startRevoke] = useTransition();
  const roleByCode = useMemo(
    () => new Map(roles.map((role) => [role.code, role])),
    [roles],
  );
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  async function submit(values: FormValues) {
    const role = roleByCode.get(values.roleCode);
    if (!role) return { success: false, error: "Vai trò không hợp lệ." };
    const branchId =
      role.allowedScope === "branch" ? Number(values.branchId) : null;
    if (
      role.allowedScope === "branch" &&
      (branchId == null || !Number.isInteger(branchId) || branchId <= 0)
    ) {
      return { success: false, error: "Chọn chi nhánh cho vai trò này." };
    }
    const result = await setRoleBindingAction({
      targetUserId,
      roleCode: role.code,
      branchId,
      active: true,
    });
    if (result.success) router.refresh();
    return result;
  }

  function revoke() {
    if (!revoking) return;
    startRevoke(async () => {
      const result = await setRoleBindingAction({
        targetUserId,
        roleCode: revoking.roleCode,
        branchId: revoking.branchId,
        active: false,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể thu hồi vai trò.");
        return;
      }
      setRevoking(null);
      router.refresh();
      toast.success("Đã thu hồi vai trò hệ thống.");
    });
  }

  const columns: DataTableColumn<RoleBinding>[] = [
    {
      key: "role",
      header: "Vai trò hệ thống",
      render: (binding) => (
        <span className="font-medium">
          {roleByCode.get(binding.roleCode)?.label ?? binding.roleCode}
        </span>
      ),
    },
    {
      key: "scope",
      header: "Phạm vi",
      render: (binding) => (
        <Badge variant="secondary">
          {binding.branchId == null
            ? "Toàn công ty"
            : (branchById.get(binding.branchId) ?? "Chi nhánh")}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      render: () => <Badge variant="success">Đang hiệu lực</Badge>,
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">Thu hồi</span>,
            className: "w-12",
            render: (binding: RoleBinding) => (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Thu hồi vai trò"
                onClick={() => setRevoking(binding)}
              >
                <Trash2 />
              </Button>
            ),
          } satisfies DataTableColumn<RoleBinding>,
        ]
      : []),
  ];

  return (
    <>
      <AppSection
        title="Vai trò và phạm vi truy cập"
        description="Chức danh trong hồ sơ không tự cấp quyền hệ thống. Mỗi vai trò dưới đây được gán độc lập theo phạm vi."
        icon={<ShieldCheck />}
        contentFlush
        action={
          canManage ? (
            <Button
              type="button"
              size="touch"
              onClick={() => setFormOpen(true)}
            >
              Gán vai trò
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          data={bindings}
          getRowKey={(binding) => binding.id}
          emptyTitle="Chưa có vai trò hệ thống"
          emptyDescription="Người này chưa được cấp quyền truy cập theo role binding."
        />
      </AppSection>

      <FormDialog<FormValues>
        open={formOpen}
        onOpenChange={setFormOpen}
        title="Gán vai trò hệ thống"
        description="Thao tác yêu cầu quyền Quản trị phân quyền và phiên đăng nhập AAL2."
        schema={formSchema}
        defaultValues={{ roleCode: roles[0]?.code ?? "", branchId: "" }}
        onSubmit={submit}
        submitLabel="Gán vai trò"
        successMessage="Đã gán vai trò hệ thống."
      >
        {(form) => {
          const role = roleByCode.get(form.watch("roleCode"));
          return (
            <>
              <SelectField
                control={form.control}
                name="roleCode"
                label="Vai trò hệ thống"
                options={roles.map((item) => ({
                  value: item.code,
                  label: item.label,
                  hint:
                    item.allowedScope === "branch"
                      ? "Theo chi nhánh"
                      : "Toàn công ty",
                }))}
                required
              />
              {role?.allowedScope === "branch" ? (
                <SelectField
                  control={form.control}
                  name="branchId"
                  label="Chi nhánh"
                  options={branches.map((branch) => ({
                    value: String(branch.id),
                    label: branch.name,
                  }))}
                  required
                />
              ) : null}
            </>
          );
        }}
      </FormDialog>

      <AppDialog
        open={revoking != null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title="Thu hồi vai trò hệ thống?"
        description="Quyền tương ứng sẽ mất hiệu lực ngay sau khi xác nhận."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={isRevoking}
              onClick={revoke}
            >
              Thu hồi
            </Button>
          </div>
        }
      />
    </>
  );
}
