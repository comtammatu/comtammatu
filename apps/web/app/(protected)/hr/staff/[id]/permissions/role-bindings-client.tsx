"use client";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: security role binding surface */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Trash2 } from "lucide-react";
import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppDialog, FormDialog, SelectField } from "@/components/form";
import { AppSection } from "@/components/surface";
import { getVerifiedTotpFactorId } from "@lib/auth/mfa";
import { MfaStepUpDialog } from "@lib/auth/mfa-step-up-dialog";
import { setRoleBindingAction } from "./actions";
import { ROLE_BINDING_ERROR_CODES } from "./role-binding-error-codes";

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
  /** Owner may open /settings/security to enroll MFA (V1 Owner-only). */
  canOpenSecuritySettings: boolean;
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
  canOpenSecuritySettings,
}: Props) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [revoking, setRevoking] = useState<RoleBinding | null>(null);
  const [isRevoking, startRevoke] = useTransition();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpFactorId, setStepUpFactorId] = useState<string | null>(null);
  const stepUpResolverRef = useRef<((ok: boolean) => void) | null>(null);
  const roleByCode = useMemo(
    () => new Map(roles.map((role) => [role.code, role])),
    [roles],
  );
  const branchById = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );

  async function requestAal2StepUp(): Promise<boolean> {
    const verified = await getVerifiedTotpFactorId();
    if (!verified.success) {
      toast.error(verified.error);
      return false;
    }
    setStepUpFactorId(verified.data);
    setStepUpOpen(true);
    return await new Promise<boolean>((resolve) => {
      stepUpResolverRef.current = resolve;
    });
  }

  function resolveStepUp(ok: boolean) {
    const resolve = stepUpResolverRef.current;
    stepUpResolverRef.current = null;
    setStepUpOpen(false);
    setStepUpFactorId(null);
    resolve?.(ok);
  }

  async function runBindingMutation(
    input: Parameters<typeof setRoleBindingAction>[0],
  ): Promise<ActionResult> {
    let result = await setRoleBindingAction(input);
    if (
      !result.success &&
      result.errorCode === ROLE_BINDING_ERROR_CODES.AAL2_REQUIRED
    ) {
      const steppedUp = await requestAal2StepUp();
      if (!steppedUp) {
        return {
          success: false,
          error: result.error ?? "Cần xác thực AAL2 trước khi thay đổi phân quyền.",
          errorCode: ROLE_BINDING_ERROR_CODES.AAL2_REQUIRED,
        };
      }
      result = await setRoleBindingAction(input);
    }
    return result;
  }

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
    const result = await runBindingMutation({
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
      const result = await runBindingMutation({
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
              size={isTouchLayout ? "touch" : "default"}
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

      <MfaStepUpDialog
        open={stepUpOpen}
        factorId={stepUpFactorId}
        canOpenSecuritySettings={canOpenSecuritySettings}
        onOpenChange={(open) => {
          if (!open) resolveStepUp(false);
        }}
        onVerified={async () => {
          resolveStepUp(true);
        }}
      />
    </>
  );
}
