"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR shift setup copy is local to this manager configuration surface */

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
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Switch } from "@comtammatu/ui/components/switch";
import { ShiftFormDialog } from "./shift-form-dialog";
import { deactivateShift, setShiftBoundaries } from "./actions";
import type { ShiftRow } from "./_types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { toast } from "@comtammatu/ui/components/sonner";

import { FORM_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";

const boundaryCopy = messages.hr.client.shiftBoundaries;

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
  const [isDeactivating, setIsDeactivating] = useState(false);

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
  }

  async function handleBoundaryChange(
    shift: ShiftRow,
    patch: { isOpening?: boolean; isClosing?: boolean },
  ) {
    const next: ShiftRow = {
      ...shift,
      is_opening: patch.isOpening ?? shift.is_opening,
      is_closing: patch.isClosing ?? shift.is_closing,
    };
    onShiftSaved(next);
    const result = await setShiftBoundaries({
      shiftId: shift.id,
      isOpening: next.is_opening,
      isClosing: next.is_closing,
    });
    if (!result.success) {
      onShiftSaved(shift);
      toast.error(result.error ?? boundaryCopy.saveFailed);
      return;
    }
    toast.success(boundaryCopy.saved);
  }

  function renderBoundaryToggle(
    shift: ShiftRow,
    field: "opening" | "closing",
  ) {
    const checked = field === "opening" ? shift.is_opening : shift.is_closing;
    return (
      <Switch
        checked={checked}
        disabled={!canManage || isDeactivating}
        aria-label={
          field === "opening"
            ? boundaryCopy.openingAria
            : boundaryCopy.closingAria
        }
        onCheckedChange={(value) =>
          void handleBoundaryChange(
            shift,
            field === "opening"
              ? { isOpening: value === true }
              : { isClosing: value === true },
          )
        }
      />
    );
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
      key: "is_opening",
      header: boundaryCopy.opening,
      render: (shift) => renderBoundaryToggle(shift, "opening"),
    },
    {
      key: "is_closing",
      header: boundaryCopy.closing,
      render: (shift) => renderBoundaryToggle(shift, "closing"),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (shift) => (
        <Badge variant={shift.is_active ? "default" : "outline"}>
          {shift.is_active
            ? ACTIVE_STATE_LABELS_VI.active
            : ACTIVE_STATE_LABELS_VI.inactive}
        </Badge>
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

      <DataTable
        columns={columns}
        data={shifts}
        getRowKey={(shift) => shift.id}
        emptyTitle="Chưa có ca làm việc nào"
        emptyIcon={<IconCalendarClock />}
        rowClassName={() => (isPending ? "opacity-60" : undefined)}
        mobileCardRender={(shift) => (
          <Item variant="outline" className={isPending ? "opacity-60" : ""}>
            <ItemContent>
              <ItemTitle className="line-clamp-none text-sm font-semibold">
                {shift.name}
              </ItemTitle>
              <ItemDescription className="line-clamp-none text-sm leading-6">
                {shift.start_time} - {shift.end_time}
              </ItemDescription>
              <Badge
                variant={shift.is_active ? "default" : "outline"}
                className="w-fit"
              >
                {shift.is_active
                  ? ACTIVE_STATE_LABELS_VI.active
                  : ACTIVE_STATE_LABELS_VI.inactive}
              </Badge>
              <div className="mt-2 flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  {renderBoundaryToggle(shift, "opening")}
                  {boundaryCopy.opening}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  {renderBoundaryToggle(shift, "closing")}
                  {boundaryCopy.closing}
                </label>
              </div>
            </ItemContent>
            {canManage ? (
              <ItemActions>{renderShiftActions(shift)}</ItemActions>
            ) : null}
          </Item>
        )}
      />

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
