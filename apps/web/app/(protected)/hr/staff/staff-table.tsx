"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import {
  FileUser as IconFileUser,
  Key as IconKey,
  Pencil as IconPencil,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
  Users as IconUsers,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { StatusBadge } from "@/components/status-badge";
import { messages } from "@lib/messages";
import { toggleStaffActive } from "./actions";
import { StaffFormDialog } from "./staff-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Item, ItemActions, ItemContent } from "@comtammatu/ui/components/item";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { RowActionsMenu } from "@/components/row-actions-menu";
import {
  ROLE_LABEL_VI,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { UNKNOWN_LABEL_VI } from "@comtammatu/shared/labels";

import { BRANCH_VI, STAFF_VI } from "@comtammatu/shared/messages";
import {
  resolveHrBranchScope,
  withHrBranchScope,
  type HrBranchScope,
} from "@/lib/hr-scope";

export interface BranchOption {
  id: number;
  name: string;
  branch_kind?: string | null;
}

export type PermissionGrantStatus =
  | "none"
  | "template"
  | "exception"
  | "mixed";

export interface StaffRow {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
  position_code: string | null;
  position_label: string | null;
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean | null;
  permissionStatus?: PermissionGrantStatus;
  /** Linked HR employee row; null = standalone login account. */
  employeeId?: number | null;
  employeeCode?: string | null;
}

export interface PositionOption {
  value: string;
  label: string;
}

interface StaffTableProps {
  staff: StaffRow[];
  branches: BranchOption[];
  positionOptions: PositionOption[];
  hasActiveFilters: boolean;
}

function StaffActiveBadge({ active }: { active: boolean | null }) {
  return (
    <StatusBadge
      domain="active-state"
      value={active !== false ? "active" : "inactive"}
    />
  );
}

function staffPositionLabel(member: StaffRow): string {
  return (
    member.position_label ??
    ROLE_LABEL_VI[member.role as StaffRole] ??
    UNKNOWN_LABEL_VI
  );
}

function isLinkedEmployee(member: StaffRow): boolean {
  return member.employeeId != null;
}

function profileHref(member: StaffRow, branchScope: HrBranchScope): string {
  const params = new URLSearchParams();
  params.set("view", "profile");
  const query = member.employeeCode?.trim() || member.full_name.trim();
  if (query) params.set("q", query);
  return withHrBranchScope(`/hr?${params.toString()}`, branchScope);
}

function StaffActionsMenu({
  member,
  variant,
  branchScope,
  onEdit,
  onToggle,
}: {
  member: StaffRow;
  variant: "card" | "table";
  branchScope: HrBranchScope;
  onEdit: (member: StaffRow) => void;
  onToggle: (member: StaffRow) => void;
}) {
  const isActive = member.is_active !== false;
  const linked = isLinkedEmployee(member);
  const staffCopy = messages.owner.staffPage;

  return (
    <RowActionsMenu
      label={staffCopy.actions}
      triggerSize={variant === "card" ? "touch" : "icon-lg"}
      triggerClassName={variant === "card" ? "rounded-full" : undefined}
      triggerLabel={variant === "card" ? staffCopy.actions : undefined}
      items={[
        {
          key: "permissions",
          label: staffCopy.actionPermissions,
          icon: <IconKey data-icon="inline-start" />,
          href: withHrBranchScope(
            `/hr/staff/${member.id}/permissions?tab=permissions`,
            branchScope,
          ),
        },
        ...(linked
          ? [
              {
                key: "open-profile",
                label: staffCopy.openProfile,
                icon: <IconFileUser data-icon="inline-start" />,
                href: profileHref(member, branchScope),
              },
            ]
          : [
              {
                key: "edit",
                label: staffCopy.actionEdit,
                icon: <IconPencil data-icon="inline-start" />,
                onSelect: () => onEdit(member),
              },
            ]),
        {
          key: isActive ? "deactivate" : "activate",
          label: isActive
            ? staffCopy.actionDeactivate
            : staffCopy.actionActivate,
          icon: isActive ? (
            <IconToggleLeft data-icon="inline-start" />
          ) : (
            <IconToggleRight data-icon="inline-start" />
          ),
          onSelect: () => onToggle(member),
          destructive: isActive,
        },
      ]}
    />
  );
}

export function StaffTable({
  staff,
  branches,
  positionOptions,
  hasActiveFilters,
}: StaffTableProps) {
  const branchScope = resolveHrBranchScope(useSearchParams().get("branch"));
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const staffCopy = messages.owner.staffPage;

  async function handleToggleActive(member: StaffRow) {
    if (member.is_active !== false) {
      const ok = await confirm({
        title: "Vô hiệu hóa đăng nhập?",
        description:
          "Tài khoản sẽ không đăng nhập được cho đến khi được kích hoạt lại. Hồ sơ NLĐ (nếu có) không bị xóa.",
        details: [{ label: STAFF_VI.long, value: member.full_name }],
        confirmText: staffCopy.actionDeactivate,
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const result = await toggleStaffActive(member.id);
      if (!result.success) {
        toast.error(result.error);
      }
    });
  }

  const columns: DataTableColumn<StaffRow>[] = [
    {
      key: "name",
      header: STAFF_VI.long,
      render: (member) => (
        <div className="flex flex-col gap-1">
          <Link
            href={withHrBranchScope(
              `/hr/staff/${member.id}/permissions`,
              branchScope,
            )}
            className="font-medium hover:underline"
          >
            {member.full_name}
          </Link>
          {!isLinkedEmployee(member) ? (
            <Badge variant="outline" className="w-fit">
              {staffCopy.standaloneBadge}
            </Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "role",
      header: STAFF_VI.role,
      render: (member) => (
        <Badge variant="secondary">{staffPositionLabel(member)}</Badge>
      ),
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-muted-foreground",
      render: (member) => member.branch_name ?? "—",
    },
    {
      key: "phone",
      header: staffCopy.phoneShort,
      className: "text-muted-foreground",
      render: (member) => member.phone ?? "—",
    },
    {
      key: "status",
      header: staffCopy.loginStatus,
      render: (member) => <StaffActiveBadge active={member.is_active} />,
    },
    {
      key: "permissions",
      header: staffCopy.actionPermissions,
      render: (member) => {
        const status = member.permissionStatus ?? "none";
        return (
          <Link
            href={withHrBranchScope(
              `/hr/staff/${member.id}/permissions?tab=permissions`,
              branchScope,
            )}
            className="inline-flex flex-col gap-1 hover:underline"
          >
            <Badge
              variant={
                status === "none"
                  ? "outline"
                  : status === "exception" || status === "mixed"
                    ? "warning"
                    : "secondary"
              }
            >
              {staffCopy.permissionStatus[status]}
            </Badge>
          </Link>
        );
      },
    },
    {
      key: "actions",
      header: <span className="sr-only">{staffCopy.actions}</span>,
      className: "w-12",
      render: (member) => (
        <StaffActionsMenu
          member={member}
          variant="table"
          branchScope={branchScope}
          onEdit={setEditStaff}
          onToggle={handleToggleActive}
        />
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        data={staff}
        pageSize={25}
        getRowKey={(member) => member.id}
        emptyTitle={
          hasActiveFilters
            ? staffCopy.emptySearchTitle
            : "Chưa có tài khoản nào"
        }
        emptyMode={hasActiveFilters ? "no-results" : "no-data"}
        emptyIcon={<IconUsers />}
        className={isPending ? "opacity-60" : undefined}
        mobileCardRender={(member) => (
          <Item
            variant="outline"
            className={isPending ? "opacity-60" : undefined}
          >
            <ItemContent className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Link
                    href={withHrBranchScope(
                      `/hr/staff/${member.id}/permissions`,
                      branchScope,
                    )}
                    className="font-medium hover:underline"
                  >
                    {member.full_name}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {member.branch_name ?? "—"}
                  </p>
                  {!isLinkedEmployee(member) ? (
                    <Badge variant="outline" className="w-fit">
                      {staffCopy.standaloneBadge}
                    </Badge>
                  ) : null}
                </div>
                <StaffActiveBadge active={member.is_active} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground">{STAFF_VI.role}</p>
                  <p>{staffPositionLabel(member)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground">
                    {staffCopy.phoneShort}
                  </p>
                  <p>{member.phone ?? "—"}</p>
                </div>
              </div>
            </ItemContent>
            <ItemActions>
              <Button
                variant="outline"
                size="touch"
                render={
                  <Link
                    href={withHrBranchScope(
                      `/hr/staff/${member.id}/permissions?tab=permissions`,
                      branchScope,
                    )}
                  />
                }
              >
                <IconKey data-icon="inline-start" />
                {staffCopy.permissionStatus[member.permissionStatus ?? "none"]}
              </Button>
              <StaffActionsMenu
                member={member}
                variant="card"
                branchScope={branchScope}
                onEdit={setEditStaff}
                onToggle={handleToggleActive}
              />
            </ItemActions>
          </Item>
        )}
      />

      {editStaff && !isLinkedEmployee(editStaff) ? (
        <StaffFormDialog
          open={!!editStaff}
          onOpenChange={(open) => !open && setEditStaff(null)}
          staff={editStaff}
          branches={branches}
          positionOptions={positionOptions}
        />
      ) : null}
    </>
  );
}
