"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: permission management surface keeps localized operational copy inline */

import { useMemo, useState, useTransition } from "react";
import { z } from "zod";
import {
  Layers as IconStack,
  Plus as IconPlus,
  Trash as IconTrash,
} from "lucide-react";
import { formatVNDate } from "@comtammatu/shared/time";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { FormDialog, SelectField, TextField } from "@/components/form";
import { AppSection } from "@/components/surface";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { messages } from "@lib/messages";
import { getStaffPermissionLabelVi } from "@lib/messages/owner";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";
import {
  applyTemplateAction,
  grantPermissionAction,
  revokePermissionAction,
} from "./actions";

interface BranchOpt {
  id: number;
  name: string;
  branchKind: string | null;
}

interface PermKey {
  key: string;
  module: string;
  description: string;
  scope: string;
}

interface Template {
  id: number;
  positionCode: string | null;
  permissionKeys: string[];
}

interface Grant {
  id: number;
  branchId: number | null;
  permissionKey: string;
  sourceTemplate: number | null;
  grantedAt: string;
  validUntil: string | null;
}

interface Props {
  targetUserId: string;
  targetFullName: string;
  targetPositionCode: string | null;
  targetPositionLabel: string;
  targetBranchId: number | null;
  currentGrants: Grant[];
  branches: BranchOpt[];
  branchNames: { id: number; name: string }[];
  permissionKeys: PermKey[];
  templates: Template[];
}

interface GrantExceptionValues {
  scope: string;
  permissionKey: string;
  validUntil: string;
}

const TENANT_SCOPE_VALUE = "__tenant__";

const grantExceptionSchema = z.object({
  scope: z.string().min(1, "Chọn phạm vi."),
  permissionKey: z.string().min(1, "Chọn quyền."),
  validUntil: z.string(),
});

function branchIdFromValue(value: string): number | null {
  return value === TENANT_SCOPE_VALUE ? null : Number(value);
}

function toIsoZ(local: string): string {
  return new Date(local).toISOString();
}

export function PermissionsClient({
  targetUserId,
  targetFullName,
  targetPositionCode,
  targetPositionLabel,
  targetBranchId,
  currentGrants,
  branches,
  branchNames,
  permissionKeys,
  templates,
}: Props) {
  const [grantDialogOpen, setGrantDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const copy = messages.owner.staffPermissions;

  const branchNameById = useMemo(
    () => new Map(branchNames.map((branch) => [branch.id, branch.name])),
    [branchNames],
  );
  const permissionByKey = useMemo(
    () =>
      new Map(permissionKeys.map((permission) => [permission.key, permission])),
    [permissionKeys],
  );
  const permissionLabelByKey = useMemo(
    () =>
      new Map(
        permissionKeys.map((permission) => [
          permission.key,
          getStaffPermissionLabelVi(permission.key, permission.description),
        ]),
      ),
    [permissionKeys],
  );
  const recommendedTemplate = templates.find(
    (template) => template.positionCode === targetPositionCode,
  );
  const permissionGroups = useMemo(() => {
    const groups = new Map<string, { value: string; label: string }[]>();
    for (const permission of permissionKeys) {
      const moduleLabel =
        copy.permissionModuleLabels[permission.module] ?? copy.otherWorkArea;
      const options = groups.get(moduleLabel) ?? [];
      options.push({
        value: permission.key,
        label:
          permissionLabelByKey.get(permission.key) ?? UNKNOWN_LABEL_VI,
      });
      groups.set(moduleLabel, options);
    }
    return Array.from(groups, ([label, options]) => ({ label, options }));
  }, [
    copy.otherWorkArea,
    copy.permissionModuleLabels,
    permissionKeys,
    permissionLabelByKey,
  ]);
  const templateGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const key of recommendedTemplate?.permissionKeys ?? []) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      const moduleLabel =
        copy.permissionModuleLabels[permission.module] ?? copy.otherWorkArea;
      const labels = groups.get(moduleLabel) ?? [];
      labels.push(permissionLabelByKey.get(key) ?? UNKNOWN_LABEL_VI);
      groups.set(moduleLabel, labels);
    }
    return Array.from(groups, ([label, permissions]) => ({
      label,
      permissions,
    }));
  }, [
    copy.otherWorkArea,
    copy.permissionModuleLabels,
    permissionByKey,
    permissionLabelByKey,
    recommendedTemplate,
  ]);
  const scopeOptions = useMemo(
    () => [
      { value: TENANT_SCOPE_VALUE, label: copy.tenantWide },
      ...branches.map((branch) => ({
        value: String(branch.id),
        label: branch.name,
      })),
    ],
    [branches, copy.tenantWide],
  );

  function grantScope(grant: Grant) {
    return grant.branchId === null
      ? copy.tenantWide
      : (branchNameById.get(grant.branchId) ??
          copy.branchFallback(grant.branchId));
  }

  function grantSource(grant: Grant) {
    if (grant.sourceTemplate === null) return copy.sourceException;
    return copy.sourceTemplate;
  }

  function permissionLabel(grant: Grant): string {
    return permissionLabelByKey.get(grant.permissionKey) ?? UNKNOWN_LABEL_VI;
  }

  function grantExpiry(grant: Grant) {
    if (!grant.validUntil) return copy.forever;
    const isExpired = new Date(grant.validUntil).getTime() <= Date.now();
    return `${isExpired ? "Đã hết hạn" : "Đến"} ${formatVNDate(grant.validUntil)}`;
  }

  async function handleRevoke(grant: Grant) {
    const description = permissionLabel(grant);
    const ok = await confirm({
      title: "Thu hồi quyền này?",
      description:
        "Nhân viên sẽ mất quyền truy cập tương ứng ngay sau khi thu hồi.",
      details: [{ label: copy.permission, value: description }],
      confirmText: "Thu hồi",
      variant: "destructive",
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await revokePermissionAction({
        target_user_id: targetUserId,
        branch_id: grant.branchId,
        permission_key: grant.permissionKey,
      });
      if (!result.success) {
        toast.error(result.error ?? "Thất bại");
        return;
      }
      toast.success(`Đã thu hồi ${description}`);
    });
  }

  function handleApplyTemplate() {
    if (!recommendedTemplate) {
      toast.error(copy.templateMissing(targetPositionLabel));
      return;
    }

    startTransition(async () => {
      const result = await applyTemplateAction({
        target_user_id: targetUserId,
        branch_id: targetBranchId,
        template_id: recommendedTemplate.id,
        valid_until: null,
      });
      if (!result.success) {
        toast.error(result.error ?? "Thất bại");
        return;
      }
      toast.success(copy.templateApplied(result.data?.rows_inserted ?? 0));
    });
  }

  async function submitGrantException(values: GrantExceptionValues) {
    const selectedPermission = permissionByKey.get(values.permissionKey);
    if (!selectedPermission) {
      return { success: false, error: "Quyền không hợp lệ." };
    }
    if (
      selectedPermission.scope === "branch" &&
      values.scope === TENANT_SCOPE_VALUE
    ) {
      return { success: false, error: "Quyền này cần chọn chi nhánh." };
    }
    if (
      selectedPermission.scope === "tenant" &&
      values.scope !== TENANT_SCOPE_VALUE
    ) {
      return {
        success: false,
        error: "Quyền này phải gán ở phạm vi toàn quán.",
      };
    }

    return grantPermissionAction({
      target_user_id: targetUserId,
      branch_id: branchIdFromValue(values.scope),
      permission_key: values.permissionKey,
      valid_until: values.validUntil ? toIsoZ(values.validUntil) : null,
    });
  }

  const grantColumns = useMemo<DataTableColumn<Grant>[]>(
    () => [
      {
        key: "permission",
        header: copy.permission,
        render: (grant) => (
          <span className="font-medium">{permissionLabel(grant)}</span>
        ),
      },
      {
        key: "scope",
        header: copy.scope,
        render: (grant) => (
          <Badge variant="secondary">{grantScope(grant)}</Badge>
        ),
      },
      {
        key: "source",
        header: copy.source,
        render: (grant) => (
          <span className="text-muted-foreground">{grantSource(grant)}</span>
        ),
      },
      {
        key: "expires",
        header: copy.expires,
        render: (grant) => (
          <span
            className="text-muted-foreground"
            title={grant.validUntil ?? undefined}
          >
            {grantExpiry(grant)}
          </span>
        ),
      },
      {
        key: "actions",
        header: <span className="sr-only">Thu hồi</span>,
        className: "w-12",
        render: (grant) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={isPending}
            onClick={() => handleRevoke(grant)}
            aria-label={`Thu hồi ${permissionLabel(grant)}`}
          >
            <IconTrash className="text-destructive" />
          </Button>
        ),
      },
    ],
    [copy, isPending, permissionLabelByKey, branchNameById],
  );

  const targetScopeLabel =
    targetBranchId === null
      ? copy.tenantWide
      : (branchNameById.get(targetBranchId) ??
        copy.branchFallback(targetBranchId));

  return (
    <div className="flex flex-col gap-4">
      <AppSection
        title={copy.templateTitle}
        description={copy.templateDescription}
        icon={<IconStack />}
      >
        {recommendedTemplate ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{targetPositionLabel}</p>
                <p className="text-sm text-muted-foreground">
                  {copy.templateScope(targetScopeLabel)}
                </p>
              </div>
              <Badge variant="secondary">
                {recommendedTemplate.permissionKeys.length} quyền
              </Badge>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-primary">
                {copy.templatePreview(
                  recommendedTemplate.permissionKeys.length,
                  templateGroups.length,
                )}
              </summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {templateGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-sm font-medium">{group.label}</p>
                    <ul className="mt-1 grid list-inside list-disc gap-1 text-sm text-muted-foreground">
                      {group.permissions.map((permission) => (
                        <li key={permission}>{permission}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
            <Button
              type="button"
              onClick={handleApplyTemplate}
              disabled={isPending}
            >
              <IconStack data-icon="inline-start" />
              {copy.templateApply(targetPositionLabel)}
            </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {copy.templateMissing(targetPositionLabel)}
          </p>
        )}
      </AppSection>

      <AppSection
        title={copy.currentTitle}
        description={copy.currentDescription}
        contentFlush
      >
        <DataTable
          columns={grantColumns}
          data={currentGrants}
          pageSize={25}
          getRowKey={(grant) => grant.id}
          emptyTitle={`${targetFullName} chưa có quyền nào.`}
          emptyDescription="Áp dụng mẫu quyền hoặc thêm một quyền ngoại lệ."
          mobileCardRender={(grant) => {
            return (
              <Item>
                <ItemContent>
                  <ItemTitle>{permissionLabel(grant)}</ItemTitle>
                  <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
                    <span>{grantScope(grant)}</span>
                    <span>{grantSource(grant)}</span>
                    <span>{grantExpiry(grant)}</span>
                  </div>
                </ItemContent>
                <ItemActions>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    disabled={isPending}
                    onClick={() => handleRevoke(grant)}
                    aria-label={`Thu hồi ${permissionLabel(grant)}`}
                  >
                    <IconTrash className="text-destructive" />
                  </Button>
                </ItemActions>
              </Item>
            );
          }}
        />
      </AppSection>

      <AppSection
        title={copy.exceptionTitle}
        description={copy.exceptionDescription}
        size="sm"
        action={
          <Button
            type="button"
            variant="outline"
            size="touch"
            onClick={() => setGrantDialogOpen(true)}
          >
            <IconPlus data-icon="inline-start" />
            {copy.addException}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">
          Chỉ mở form này khi cần cấp thêm quyền riêng cho một người.
        </p>
      </AppSection>

      <FormDialog<GrantExceptionValues>
        open={grantDialogOpen}
        onOpenChange={setGrantDialogOpen}
        title={copy.grantExceptionTitle}
        description={copy.grantExceptionDescription}
        schema={grantExceptionSchema}
        defaultValues={{ scope: "", permissionKey: "", validUntil: "" }}
        onSubmit={submitGrantException}
        successMessage={copy.grantExceptionSuccess}
        submitLabel={copy.addException}
        entityKey={targetUserId}
      >
        {(form) => (
          <>
            <SelectField
              control={form.control}
              name="scope"
              label={copy.scope}
              options={scopeOptions}
              placeholder={copy.scopePlaceholder}
              required
            />
            <SelectField
              control={form.control}
              name="permissionKey"
              label={copy.permission}
              groups={permissionGroups}
              placeholder={copy.permissionPlaceholder}
              required
            />
            <TextField
              control={form.control}
              name="validUntil"
              label={copy.validUntil}
              type="datetime-local"
              description={copy.validUntilDescription}
            />
          </>
        )}
      </FormDialog>
    </div>
  );
}
