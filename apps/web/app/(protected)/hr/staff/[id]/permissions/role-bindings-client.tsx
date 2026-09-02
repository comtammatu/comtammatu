"use client";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

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
import { messages } from "@lib/messages";
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

const copy = messages.hr.accessControl;

const formSchema = z.object({
  roleCode: z.string().min(1, copy.roleRequired),
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
          error: result.error ?? copy.reauthenticateRequired,
          errorCode: ROLE_BINDING_ERROR_CODES.AAL2_REQUIRED,
        };
      }
      result = await setRoleBindingAction(input);
    }
    return result;
  }

  async function submit(values: FormValues) {
    const role = roleByCode.get(values.roleCode);
    if (!role) return { success: false, error: copy.invalidRole };
    const branchId =
      role.allowedScope === "branch" ? Number(values.branchId) : null;
    if (
      role.allowedScope === "branch" &&
      (branchId == null || !Number.isInteger(branchId) || branchId <= 0)
    ) {
      return { success: false, error: copy.branchRequired };
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
        toast.error(result.error ?? copy.revokeFailed);
        return;
      }
      setRevoking(null);
      router.refresh();
      toast.success(copy.revoked);
    });
  }

  const columns: DataTableColumn<RoleBinding>[] = [
    {
      key: "role",
      header: copy.roleHeader,
      render: (binding) => (
        <span className="font-medium">
          {roleByCode.get(binding.roleCode)?.label ?? binding.roleCode}
        </span>
      ),
    },
    {
      key: "scope",
      header: copy.scopeHeader,
      render: (binding) => (
        <Badge variant="secondary">
          {binding.branchId == null
            ? copy.tenantScope
            : (branchById.get(binding.branchId) ?? copy.branchFallback)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: copy.statusHeader,
      render: () => <Badge variant="success">{copy.active}</Badge>,
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{copy.revoke}</span>,
            className: "w-12",
            render: (binding: RoleBinding) => (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={copy.revokeAria}
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
        title={copy.sectionTitle}
        description={copy.sectionDescription}
        icon={<ShieldCheck />}
        contentFlush
        action={
          canManage ? (
            <Button
              type="button"
              size={isTouchLayout ? "touch" : "default"}
              onClick={() => setFormOpen(true)}
            >
              {copy.addRole}
            </Button>
          ) : undefined
        }
      >
        <DataTable
          columns={columns}
          data={bindings}
          getRowKey={(binding) => binding.id}
          emptyTitle={copy.emptyTitle}
          emptyDescription={copy.emptyDescription}
        />
      </AppSection>

      <FormDialog<FormValues>
        open={formOpen}
        onOpenChange={setFormOpen}
        title={copy.formTitle}
        description={copy.formDescription}
        schema={formSchema}
        defaultValues={{ roleCode: roles[0]?.code ?? "", branchId: "" }}
        onSubmit={submit}
        submitLabel={copy.addRole}
        successMessage={copy.assigned}
      >
        {(form) => {
          const role = roleByCode.get(form.watch("roleCode"));
          return (
            <>
              <SelectField
                control={form.control}
                name="roleCode"
                label={copy.roleHeader}
                options={roles.map((item) => ({
                  value: item.code,
                  label: item.label,
                  hint:
                    item.allowedScope === "branch"
                      ? copy.branchScopeHint
                      : copy.tenantScopeHint,
                }))}
                required
              />
              {role?.allowedScope === "branch" ? (
                <SelectField
                  control={form.control}
                  name="branchId"
                  label={copy.branchLabel}
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
        title={copy.revokeTitle}
        description={copy.revokeDescription}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRevoking(null)}>
              {copy.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={isRevoking}
              onClick={revoke}
            >
              {copy.revoke}
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
