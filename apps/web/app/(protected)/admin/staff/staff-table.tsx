"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Key as IconKey,
  Ellipsis as IconDots,
  Pencil as IconPencil,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
  Users as IconUsers,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { toggleStaffActive } from "./actions";
import { StaffFormDialog } from "./staff-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";

import { BRANCH_VI, FORM_VI, STAFF_VI } from "@comtammatu/shared/messages";
export interface BranchOption {
  id: number;
  name: string;
  branch_kind?: string | null;
}

export interface StaffRow {
  id: string;
  full_name: string;
  phone: string | null;
  role: string;
  position_label: string | null;
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean | null;
}

export interface PositionOption {
  value: string;
  label: string;
}

interface StaffTableProps {
  staff: StaffRow[];
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

function StaffActiveBadge({ active }: { active: boolean | null }) {
  return (
    <Badge variant={active !== false ? "default" : "outline"}>
      {active !== false
        ? ACTIVE_STATE_LABELS_VI.active
        : ACTIVE_STATE_LABELS_VI.inactive}
    </Badge>
  );
}

function StaffActionsMenu({
  member,
  variant,
  onEdit,
  onToggle,
}: {
  member: StaffRow;
  variant: "card" | "table";
  onEdit: (member: StaffRow) => void;
  onToggle: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "card" ? (
          <Button variant="ghost" size="sm" className="rounded-full">
            <IconDots className="size-4" />
            Tác vụ
          </Button>
        ) : (
          <Button variant="ghost" size="icon-lg">
            <IconDots className="size-4" />
            <span className="sr-only">Menu</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(member)}>
          <IconPencil className="mr-2 size-4" />
          Chỉnh sửa
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/admin/staff/${member.id}/permissions`}>
            <IconKey className="mr-2 size-4" />
            Quyền hạn
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggle(member.id)}>
          {member.is_active !== false ? (
            <>
              <IconToggleLeft className="mr-2 size-4" />
              Vô hiệu hóa
            </>
          ) : (
            <>
              <IconToggleRight className="mr-2 size-4" />
              Kích hoạt
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function StaffTable({
  staff,
  branches,
  positionOptions,
}: StaffTableProps) {
  const [editStaff, setEditStaff] = useState<StaffRow | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(id: string) {
    startTransition(async () => {
      const result = await toggleStaffActive(id);
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
        <span className="font-medium">{member.full_name}</span>
      ),
    },
    {
      key: "role",
      header: STAFF_VI.role,
      render: (member) => (
        <Badge variant="secondary">
          {member.position_label ?? member.role}
        </Badge>
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
      header: "SĐT",
      className: "text-muted-foreground",
      render: (member) => member.phone ?? "—",
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (member) => <StaffActiveBadge active={member.is_active} />,
    },
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (member) => (
        <StaffActionsMenu
          member={member}
          variant="table"
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
        getRowKey={(member) => member.id}
        emptyTitle="Chưa có nhân viên nào"
        emptyIcon={<IconUsers />}
        className={isPending ? "opacity-60" : undefined}
        mobileCardRender={(member) => (
          <div className="rounded-lg border border-border/70 bg-background p-4 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{member.full_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {member.branch_name ?? "—"}
                </p>
              </div>
              <StaffActiveBadge active={member.is_active} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{STAFF_VI.role}</p>
                <p className="mt-1">{member.position_label ?? member.role}</p>
              </div>
              <div>
                <p className="text-muted-foreground">SĐT</p>
                <p className="mt-1">{member.phone ?? "—"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end">
              <StaffActionsMenu
                member={member}
                variant="card"
                onEdit={setEditStaff}
                onToggle={handleToggleActive}
              />
            </div>
          </div>
        )}
      />

      <StaffFormDialog
        open={!!editStaff}
        onOpenChange={(open) => !open && setEditStaff(null)}
        staff={editStaff}
        branches={branches}
        positionOptions={positionOptions}
      />
    </>
  );
}
