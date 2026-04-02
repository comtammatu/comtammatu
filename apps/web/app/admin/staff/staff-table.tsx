"use client";

import { useState, useTransition } from "react";
import {
  MoreHorizontal,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Users,
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
import { toggleStaffActive } from "./actions";
import { StaffFormDialog } from "./staff-form-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { ROLE_LABELS } from "./role-labels";

export interface BranchOption {
  id: number;
  name: string;
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
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nhân viên</TableHead>
              <TableHead className="hidden sm:table-cell">Vai trò</TableHead>
              <TableHead className="hidden md:table-cell">Chi nhánh</TableHead>
              <TableHead className="hidden lg:table-cell">SĐT</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center">
                  <Users className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    Chưa có nhân viên nào
                  </p>
                </TableCell>
              </TableRow>
            )}
            {staff.map((member) => (
              <TableRow
                key={member.id}
                className={isPending ? "opacity-60" : ""}
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
                    {member.is_active !== false ? "Hoạt động" : "Ngừng"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditStaff(member)}>
                        <Pencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(member.id)}
                      >
                        {member.is_active !== false ? (
                          <>
                            <ToggleLeft className="mr-2 size-4" />
                            Vô hiệu hóa
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-2 size-4" />
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
