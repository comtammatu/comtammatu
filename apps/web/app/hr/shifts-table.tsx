"use client";

import { useState } from "react";
import { CalendarClock as IconCalendarClock, Plus as IconPlus } from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { ShiftFormDialog } from "./shift-form-dialog";
import type { BranchOption, ShiftRow } from "./page";
import { TableEmptyStateRow } from "../admin/components/table-empty-state-row";

interface ShiftsTableProps {
  shifts: ShiftRow[];
  branches: BranchOption[];
  selectedBranchId: number | null;
  isPending: boolean;
  onShiftCreated: (shift: ShiftRow) => void;
}

export function ShiftsTable({
  shifts,
  branches,
  selectedBranchId,
  isPending,
  onShiftCreated,
}: ShiftsTableProps) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isPending ? "Đang tải..." : `${shifts.length} ca làm việc`}
        </p>
        <Button
          onClick={() => setAddOpen(true)}
          disabled={selectedBranchId === null}
        >
          <IconPlus className="mr-2 size-4" />
          Thêm ca
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên ca</TableHead>
              <TableHead>Chi nhánh</TableHead>
              <TableHead>Giờ bắt đầu</TableHead>
              <TableHead>Giờ kết thúc</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.length === 0 && !isPending && (
              <TableEmptyStateRow
                colSpan={5}
                title={
                  selectedBranchId === null
                    ? "Chọn chi nhánh để xem ca làm việc"
                    : "Chưa có ca làm việc nào"
                }
                icon={
                  <IconCalendarClock className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {shifts.map((shift) => {
              const branchName =
                branches.find((b) => b.id === selectedBranchId)?.name ?? "—";
              return (
                <TableRow
                  key={shift.id}
                  className={isPending ? "opacity-60" : ""}
                >
                  <TableCell>
                    <span className="font-medium">{shift.name}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {branchName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {shift.start_time}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {shift.end_time}
                  </TableCell>
                  <TableCell>
                    <Badge variant={shift.is_active ? "default" : "outline"}>
                      {shift.is_active
                        ? ACTIVE_STATE_LABELS_VI.active
                        : ACTIVE_STATE_LABELS_VI.inactive}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ShiftFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        branches={branches}
        defaultBranchId={selectedBranchId}
        onShiftCreated={onShiftCreated}
      />
    </>
  );
}
