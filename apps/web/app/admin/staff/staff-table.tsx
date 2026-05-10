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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { EmptyStatePanel } from "../components/empty-state-panel";
import { toggleStaffActive } from "./actions";
import { StaffFormDialog } from "./staff-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { ROLE_LABELS } from "./role-labels";
import { TableEmptyStateRow } from "../components/table-empty-state-row";

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
  branch_id: number | null;
  branch_name: string | null;
  is_active: boolean | null;
}

interface StaffTableProps {
  staff: StaffRow[];
  branches: BranchOption[];
}

export function StaffTable({ staff, branches }: StaffTableProps) {
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

  return (
    <>
      {staff.length === 0 ? (
        <EmptyStatePanel title="Chưa có nhân viên nào" icon={<IconUsers />} />
      ) : null}

      <div className="space-y-3 md:hidden">
        {staff.map((member) => (
          <div
            key={member.id}
            className={`rounded-lg border border-border/70 bg-background p-4 transition-colors ${isPending ? "opacity-60" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{member.full_name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {member.branch_name ?? "—"}
                </p>
              </div>
              <Badge
                variant={member.is_active !== false ? "default" : "outline"}
              >
                {member.is_active !== false
                  ? ACTIVE_STATE_LABELS_VI.active
                  : ACTIVE_STATE_LABELS_VI.inactive}
              </Badge>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">{STAFF_VI.role}</p>
                <p className="mt-1">
                  {ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ??
                    member.role}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">SĐT</p>
                <p className="mt-1">{member.phone ?? "—"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-full">
                    <IconDots className="size-4" />
                    Tác vụ
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setEditStaff(member)}>
                    <IconPencil />
                    Chỉnh sửa
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/admin/staff/${member.id}/permissions`}>
                      <IconKey />
                      Quyền hạn
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => handleToggleActive(member.id)}
                  >
                    {member.is_active !== false ? (
                      <>
                        <IconToggleLeft />
                        Vô hiệu hóa
                      </>
                    ) : (
                      <>
                        <IconToggleRight />
                        Kích hoạt
                      </>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden rounded-md border md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead variant="eyebrow">
                {STAFF_VI.long}
              </TableHead>
              <TableHead variant="eyebrow" className="hidden sm:table-cell">
                {STAFF_VI.role}
              </TableHead>
              <TableHead variant="eyebrow" className="hidden md:table-cell">
                {BRANCH_VI.long}
              </TableHead>
              <TableHead variant="eyebrow" className="hidden lg:table-cell">
                SĐT
              </TableHead>
              <TableHead variant="eyebrow">
                {FORM_VI.status}
              </TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                title="Chưa có nhân viên nào"
                icon={
                  <IconUsers className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {staff.map((member) => (
              <TableRow
                key={member.id}
                className={`transition-colors hover:bg-muted/30 ${isPending ? "opacity-60" : ""}`}
              >
                <TableCell>
                  <span className="font-medium">{member.full_name}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary">
                    {ROLE_LABELS[member.role as keyof typeof ROLE_LABELS] ??
                      member.role}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {member.branch_name ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {member.phone ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={member.is_active !== false ? "default" : "outline"}
                  >
                    {member.is_active !== false
                      ? ACTIVE_STATE_LABELS_VI.active
                      : ACTIVE_STATE_LABELS_VI.inactive}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-lg">
                        <IconDots className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditStaff(member)}>
                        <IconPencil />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/staff/${member.id}/permissions`}>
                          <IconKey />
                          Quyền hạn
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => handleToggleActive(member.id)}
                      >
                        {member.is_active !== false ? (
                          <>
                            <IconToggleLeft />
                            Vô hiệu hóa
                          </>
                        ) : (
                          <>
                            <IconToggleRight />
                            Kích hoạt
                          </>
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <StaffFormDialog
        open={!!editStaff}
        onOpenChange={(open) => !open && setEditStaff(null)}
        staff={editStaff}
        branches={branches}
      />
    </>
  );
}
