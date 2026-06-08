"use client";

import { useState, useTransition } from "react";
import {
  Building as IconBuilding,
  Clock as IconClock,
  Ellipsis as IconDots,
  Pencil as IconPencil,
  ToggleLeft as IconToggleLeft,
  ToggleRight as IconToggleRight,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  ACTIVE_STATE_LABELS_VI,
  getSiteKindLabelVi,
} from "@comtammatu/shared/labels";
import { toggleBranchActive } from "./actions";
import { BranchFormDialog } from "./branch-form-dialog";
import { AttendanceConfigDialog } from "./attendance-config-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

import { FORM_VI } from "@comtammatu/shared/messages";
export interface BranchRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean | null;
  branch_kind: string | null;
  latitude: number | null;
  longitude: number | null;
  hasAttendanceSecret: boolean;
}

interface BranchTableProps {
  branches: BranchRow[];
}

export function BranchTable({ branches }: BranchTableProps) {
  const [editBranch, setEditBranch] = useState<BranchRow | null>(null);
  const [attendanceBranch, setAttendanceBranch] = useState<BranchRow | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  function handleToggleActive(id: number) {
    startTransition(async () => {
      const result = await toggleBranchActive({ id });
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
              <TableHead>Điểm vận hành</TableHead>
              <TableHead className="hidden sm:table-cell">
                {FORM_VI.type}
              </TableHead>
              <TableHead className="hidden sm:table-cell">Địa chỉ</TableHead>
              <TableHead className="hidden md:table-cell">Điện thoại</TableHead>
              <TableHead>{FORM_VI.status}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                title="Chưa có điểm vận hành nào"
                icon={
                  <IconBuilding className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {branches.map((branch) => (
              <TableRow
                key={branch.id}
                className={isPending ? "opacity-60" : ""}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{branch.name}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className="text-xs">
                    {getSiteKindLabelVi(branch.branch_kind ?? "branch")}
                  </Badge>
                </TableCell>
                <TableCell className="hidden max-w-xs sm:table-cell">
                  <span
                    className="block truncate text-muted-foreground"
                    title={branch.address ?? undefined}
                  >
                    {branch.address || "—"}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {branch.phone || "—"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={branch.is_active !== false ? "default" : "outline"}
                  >
                    {branch.is_active !== false
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
                      <DropdownMenuItem onClick={() => setEditBranch(branch)}>
                        <IconPencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(branch.id)}
                      >
                        {branch.is_active !== false ? (
                          <>
                            <IconToggleLeft className="mr-2 size-4" />
                            Tạm ngừng
                          </>
                        ) : (
                          <>
                            <IconToggleRight className="mr-2 size-4" />
                            Kích hoạt
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setAttendanceBranch(branch)}
                      >
                        <IconClock className="mr-2 size-4" />
                        Cấu hình chấm công
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BranchFormDialog
        open={!!editBranch}
        onOpenChange={(open) => !open && setEditBranch(null)}
        branch={editBranch}
      />

      {attendanceBranch && (
        <AttendanceConfigDialog
          open={!!attendanceBranch}
          onOpenChange={(open) => !open && setAttendanceBranch(null)}
          branch={{
            id: attendanceBranch.id,
            name: attendanceBranch.name,
            latitude: attendanceBranch.latitude,
            longitude: attendanceBranch.longitude,
            hasSecret: attendanceBranch.hasAttendanceSecret,
          }}
        />
      )}

    </>
  );
}
