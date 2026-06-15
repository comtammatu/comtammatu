"use client";

import { useState } from "react";
import {
  CalendarClock as IconCalendarClock,
  Pencil as IconPencil,
  Plus as IconPlus,
  PowerOff as IconPowerOff,
} from "lucide-react";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { ShiftFormDialog } from "./shift-form-dialog";
import { deactivateShift } from "./actions";
import type { ShiftRow } from "./page";
import { TableEmptyStateRow } from "@/components/table-empty-state-row";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";

import { FORM_VI } from "@comtammatu/shared/messages";

interface ShiftsTableProps {
  shifts: ShiftRow[];
  isPending: boolean;
  canManage: boolean;
  onShiftSaved: (shift: ShiftRow) => void;
}

export function ShiftsTable({
  shifts,
  isPending,
  canManage,
  onShiftSaved,
}: ShiftsTableProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<ShiftRow | null>(
    null,
  );
  const [isDeactivating, setIsDeactivating] = useState(false);

  async function handleDeactivateShift() {
    if (!deactivateTarget) return;
    setIsDeactivating(true);
    const result = await deactivateShift({ shiftId: deactivateTarget.id });
    setIsDeactivating(false);
    if (!result.success) {
      toast.error(result.error ?? "Không thể ngưng dùng ca");
      return;
    }
    toast.success("Đã ngưng dùng ca");
    const saved = result.data as ShiftRow | null;
    onShiftSaved({
      ...deactivateTarget,
      ...(saved ?? {}),
      is_active: false,
    });
    setDeactivateTarget(null);
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isPending
            ? "Đang tải..."
            : `${shifts.length} ca làm việc · dùng chung mọi chi nhánh`}
        </p>
        {canManage ? (
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus data-icon="inline-start" />
            Thêm ca
          </Button>
        ) : null}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên ca</TableHead>
              <TableHead>Giờ bắt đầu</TableHead>
              <TableHead>Giờ kết thúc</TableHead>
              <TableHead>{FORM_VI.status}</TableHead>
              {canManage ? (
                <TableHead className="text-right">Thao tác</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {shifts.length === 0 && !isPending && (
              <TableEmptyStateRow
                colSpan={canManage ? 5 : 4}
                title="Chưa có ca làm việc nào"
                icon={
                  <IconCalendarClock className="mx-auto size-8 text-muted-foreground" />
                }
              />
            )}
            {shifts.map((shift) => (
              <TableRow
                key={shift.id}
                className={isPending ? "opacity-60" : ""}
              >
                <TableCell>
                  <span className="font-medium">{shift.name}</span>
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
                {canManage ? (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => {
                          setEditingShift(shift);
                          setAddOpen(true);
                        }}
                        aria-label="Sửa ca"
                      >
                        <IconPencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={!shift.is_active}
                        onClick={() => setDeactivateTarget(shift)}
                        aria-label="Ngưng dùng ca"
                      >
                        <IconPowerOff />
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canManage ? (
        <ShiftFormDialog
          open={addOpen}
          onOpenChange={(open) => {
            setAddOpen(open);
            if (!open) setEditingShift(null);
          }}
          shift={editingShift}
          onShiftSaved={onShiftSaved}
        />
      ) : null}

      <AlertDialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeactivateTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ngưng dùng ca?</AlertDialogTitle>
            <AlertDialogDescription>
              Ca <strong>{deactivateTarget?.name ?? ""}</strong> sẽ không còn
              xuất hiện khi nhân viên chấm công. Lịch sử cũ được giữ nguyên.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeactivating}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivateShift}
              disabled={isDeactivating}
            >
              {isDeactivating ? <Spinner data-icon="inline-start" /> : null}
              Ngưng dùng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
