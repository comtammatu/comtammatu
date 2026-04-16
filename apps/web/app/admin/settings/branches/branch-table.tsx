"use client";

import { useState, useTransition } from "react";
import {
  Building2,
  Clock,
  MoreHorizontal,
  Pencil,
  Star,
  ToggleLeft,
  ToggleRight,
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
import { toggleBranchActive, setHeadquarters } from "./actions";
import { BranchFormDialog } from "./branch-form-dialog";
import { AttendanceConfigDialog } from "./attendance-config-dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { TableEmptyStateRow } from "../../components/table-empty-state-row";

export interface BranchRow {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  is_active: boolean | null;
  is_headquarters: boolean | null;
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

  function handleSetHQ(id: number) {
    startTransition(async () => {
      const result = await setHeadquarters({ id });
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
              <TableHead className="hidden sm:table-cell">Loại</TableHead>
              <TableHead className="hidden sm:table-cell">Địa chỉ</TableHead>
              <TableHead className="hidden md:table-cell">Điện thoại</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                title="Chưa có điểm vận hành nào"
                icon={
                  <Building2 className="mx-auto size-8 text-muted-foreground" />
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
                    {branch.is_headquarters === true && (
                      <Badge variant="secondary" className="text-xs">
                        <Star className="mr-1 size-3" />
                        HQ
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="outline" className="text-xs">
                    {getSiteKindLabelVi(branch.branch_kind ?? "branch")}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {branch.address || "—"}
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
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Menu</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditBranch(branch)}>
                        <Pencil className="mr-2 size-4" />
                        Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleToggleActive(branch.id)}
                      >
                        {branch.is_active !== false ? (
                          <>
                            <ToggleLeft className="mr-2 size-4" />
                            Tạm ngừng
                          </>
                        ) : (
                          <>
                            <ToggleRight className="mr-2 size-4" />
                            Kích hoạt
                          </>
                        )}
                      </DropdownMenuItem>
                      {branch.is_headquarters !== true && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleSetHQ(branch.id)}
                          >
                            <Star className="mr-2 size-4" />
                            Đặt làm trụ sở chính
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setAttendanceBranch(branch)}
                      >
                        <Clock className="mr-2 size-4" />
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
