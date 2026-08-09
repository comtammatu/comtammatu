"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR shift setup copy is local to this manager configuration surface */

import { useState } from "react";
import {
  CalendarClock as IconCalendarClock,
  Pencil as IconPencil,
  Plus as IconPlus,
  PowerOff as IconPowerOff,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { ShiftFormDialog } from "./shift-form-dialog";
import { deactivateShift } from "./actions";
import type { ShiftRow } from "./_types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { toast } from "@comtammatu/ui/components/sonner";
import { useLongPress } from "@lib/hooks/use-long-press";

import { FORM_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  formatShiftDuration,
  getShiftDurationMinutes,
  isUnusualShiftDuration,
} from "@lib/hr/shift-duration";

const shiftsCopy = messages.hr.client;

interface ShiftsTableProps {
  shifts: ShiftRow[];
  isPending: boolean;
  canManage: boolean;
  onShiftSaved: (shift: ShiftRow) => void;
}

// ─── Mobile card sub-component ────────────────────────────────────────

function MobileShiftCard({
  shift,
  isPending,
  onOpenDrawer,
}: {
  shift: ShiftRow;
  isPending: boolean;
  onOpenDrawer: (shift: ShiftRow) => void;
}) {
  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(shift),
    onClick: () => onOpenDrawer(shift),
  });

  return (
    <InteractiveCard
      minHeight="mobile"
      className={`h-auto touch-pan-y select-none cursor-pointer ${isPending ? "opacity-60" : ""}`}
      {...longPress}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold">{shift.name}</p>
          <StatusBadge
            domain="active-state"
            value={shift.is_active ? "active" : "inactive"}
          />
        </div>
        <p className="text-xs text-muted-foreground font-mono">
          {shift.start_time} – {shift.end_time}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {formatShiftDuration(shift.start_time, shift.end_time)}
          </span>
          {isUnusualShiftDuration(
            getShiftDurationMinutes(shift.start_time, shift.end_time),
          ) ? (
            <Badge variant="warning">Kiểm tra giờ</Badge>
          ) : null}
        </div>
      </div>
    </InteractiveCard>
  );
}

// ─── Main component ────────────────────────────────────────────────────

export function ShiftsTable({
  shifts,
  isPending,
  canManage,
  onShiftSaved,
}: ShiftsTableProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<ShiftRow | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [drawerShift, setDrawerShift] = useState<ShiftRow | null>(null);

  async function handleDeactivateShift(shift: ShiftRow) {
    const ok = await confirm({
      title: "Ngưng dùng ca?",
      description: `Ca ${shift.name} sẽ không còn xuất hiện khi nhân viên chấm công. Lịch sử cũ được giữ nguyên.`,
      confirmText: "Ngưng dùng",
      cancelText: "Hủy",
      variant: "destructive",
    });
    if (!ok) return;

    setIsDeactivating(true);
    const result = await deactivateShift({ shiftId: shift.id }).finally(() =>
      setIsDeactivating(false),
    );
    if (!result.success) {
      toast.error(result.error ?? "Không thể ngưng dùng ca");
      return;
    }
    toast.success("Đã ngưng dùng ca");
    const saved = result.data as ShiftRow | null;
    onShiftSaved({
      ...shift,
      ...(saved ?? {}),
      is_active: false,
    });
    setDrawerShift(null);
  }

  function renderShiftActions(shift: ShiftRow) {
    return (
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
          disabled={!shift.is_active || isDeactivating}
          onClick={() => void handleDeactivateShift(shift)}
          aria-label="Ngưng dùng ca"
        >
          <IconPowerOff />
        </Button>
      </div>
    );
  }

  const columns: DataTableColumn<ShiftRow>[] = [
    {
      key: "name",
      header: "Tên ca",
      render: (shift) => <span className="font-medium">{shift.name}</span>,
    },
    {
      key: "start_time",
      header: "Giờ bắt đầu",
      className: "text-muted-foreground",
      render: (shift) => shift.start_time,
    },
    {
      key: "end_time",
      header: "Giờ kết thúc",
      className: "text-muted-foreground",
      render: (shift) => shift.end_time,
    },
    {
      key: "duration",
      header: "Thời lượng",
      render: (shift) => {
        const duration = getShiftDurationMinutes(
          shift.start_time,
          shift.end_time,
        );
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span>{formatShiftDuration(shift.start_time, shift.end_time)}</span>
            {isUnusualShiftDuration(duration) ? (
              <Badge variant="warning">Kiểm tra giờ</Badge>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (shift) => (
        <StatusBadge
          domain="active-state"
          value={shift.is_active ? "active" : "inactive"}
        />
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "actions",
      header: "Thao tác",
      className: "text-right",
      render: renderShiftActions,
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isPending
            ? shiftsCopy.shiftsLoading
            : shiftsCopy.shiftsSummary(shifts.length)}
        </p>
        {canManage ? (
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus data-icon="inline-start" />
            Thêm ca
          </Button>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        data={shifts}
        getRowKey={(shift) => shift.id}
        emptyTitle={shiftsCopy.shiftsEmptyTitle}
        emptyIcon={<IconCalendarClock />}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(shift) => (
          <MobileShiftCard
            shift={shift}
            isPending={isPending}
            onOpenDrawer={setDrawerShift}
          />
        )}
      />

      <Drawer
        open={!!drawerShift}
        onOpenChange={(open) => !open && setDrawerShift(null)}
      >
        <DrawerContent>
          {drawerShift && (
            <>
              <DrawerHeader>
                <DrawerTitle>{drawerShift.name}</DrawerTitle>
                <DrawerDescription>
                  {drawerShift.start_time} – {drawerShift.end_time} ·{" "}
                  {formatShiftDuration(
                    drawerShift.start_time,
                    drawerShift.end_time,
                  )}
                </DrawerDescription>
              </DrawerHeader>
              <div className="flex flex-col gap-4 p-4">
                <StatusBadge
                  domain="active-state"
                  value={drawerShift.is_active ? "active" : "inactive"}
                  className="w-fit"
                />
                {canManage && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setDrawerShift(null);
                        setEditingShift(drawerShift);
                        setAddOpen(true);
                      }}
                    >
                      <IconPencil data-icon="inline-start" />
                      Sửa ca
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      disabled={!drawerShift.is_active || isDeactivating}
                      onClick={() => void handleDeactivateShift(drawerShift)}
                    >
                      <IconPowerOff data-icon="inline-start" />
                      Ngưng dùng
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>

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
    </>
  );
}
