"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Key as IconKey,
  Ellipsis as IconDots,
  Pencil as IconPencil,
  Search as IconSearch,
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
} from "@comtammatu/ui/components/item";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { toggleStaffActive } from "./actions";
import { StaffFormDialog } from "./staff-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
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
  position_code: string | null;
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
  onToggle: (member: StaffRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === "card" ? (
          <Button variant="ghost" size="sm" className="rounded-full">
            <IconDots className="size-4" />
            {messages.admin.staffPage.actions}
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
          {messages.admin.staffPage.actionEdit}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`/hr/staff/${member.id}/permissions`}>
            <IconKey className="mr-2 size-4" />
            {messages.admin.staffPage.actionPermissions}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggle(member)}>
          {member.is_active !== false ? (
            <>
              <IconToggleLeft className="mr-2 size-4" />
              {messages.admin.staffPage.actionDeactivate}
            </>
          ) : (
            <>
              <IconToggleRight className="mr-2 size-4" />
              {messages.admin.staffPage.actionActivate}
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
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const staffCopy = messages.admin.staffPage;

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return staff;
    return staff.filter((member) =>
      matchesSearch(
        [
          member.full_name,
          member.phone,
          member.position_label ?? member.role,
          member.branch_name,
        ],
        q,
      ),
    );
  }, [staff, search]);

  async function handleToggleActive(member: StaffRow) {
    if (member.is_active !== false) {
      const ok = await confirm({
        title: "Ngừng kích hoạt nhân viên?",
        description:
          "Nhân viên sẽ không thể đăng nhập hoặc thao tác cho đến khi được kích hoạt lại.",
        details: [{ label: STAFF_VI.long, value: member.full_name }],
        confirmText: "Ngừng kích hoạt",
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
      header: staffCopy.phoneShort,
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
      <InputGroup className="h-12 sm:h-10">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          placeholder={staffCopy.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          inputMode="search"
        />
      </InputGroup>
      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(member) => member.id}
        emptyTitle={
          search.trim() ? staffCopy.emptySearchTitle : "Chưa có nhân viên nào"
        }
        emptyMode={search.trim() ? "no-results" : "no-data"}
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
                  <p className="font-medium">{member.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {member.branch_name ?? "—"}
                  </p>
                </div>
                <StaffActiveBadge active={member.is_active} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground">{STAFF_VI.role}</p>
                  <p>{member.position_label ?? member.role}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-muted-foreground">{staffCopy.phoneShort}</p>
                  <p>{member.phone ?? "—"}</p>
                </div>
              </div>
            </ItemContent>
            <ItemActions>
              <StaffActionsMenu
                member={member}
                variant="card"
                onEdit={setEditStaff}
                onToggle={handleToggleActive}
              />
            </ItemActions>
          </Item>
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
