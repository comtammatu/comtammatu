"use client";

import { Plus as IconPlus, Star as IconStar, X as IconX } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { messages } from "@lib/messages";
import {
  rosterAssignmentKey,
  rosterCellKey,
  type RosterShift,
} from "./roster-model";
import { formatShiftLabel } from "./roster-week-helpers";

const copy = messages.hr.roster;
const ADD_SHIFT_VALUE = "__add_shift__";

export function RosterDayCell({
  employeeId,
  workDate,
  shifts,
  assignedShiftIds,
  leaderMap,
  dirty,
  isPending,
  touch = false,
  onAddShift,
  onRemoveShift,
  onLeaderToggle,
}: {
  employeeId: number;
  workDate: string;
  shifts: RosterShift[];
  assignedShiftIds: number[];
  leaderMap: Map<string, { assignmentId: number; isLeader: boolean }>;
  dirty: boolean;
  isPending: boolean;
  touch?: boolean;
  onAddShift: (employeeId: number, workDate: string, shiftId: number) => void;
  onRemoveShift: (
    employeeId: number,
    workDate: string,
    shiftId: number,
  ) => void;
  onLeaderToggle: (
    employeeId: number,
    workDate: string,
    shiftId: number,
    nextLeader: boolean,
  ) => void;
}) {
  const cellKey = rosterCellKey(employeeId, workDate);
  const availableShifts = shifts.filter(
    (shift) => !assignedShiftIds.includes(shift.id),
  );

  return (
    <div className="flex min-w-32 flex-col gap-1">
      {assignedShiftIds.map((shiftId) => {
        const shift = shifts.find((item) => item.id === shiftId);
        const leaderKey = rosterAssignmentKey(employeeId, workDate, shiftId);
        const leader = leaderMap.get(leaderKey);
        const canToggleLeader =
          !dirty && leader != null && leader.assignmentId > 0;
        return (
          <div key={leaderKey} className="flex items-center gap-1">
            <Badge variant="outline" className="min-w-0 flex-1 justify-start">
              <span className="truncate">
                {shift
                  ? formatShiftLabel(shift.name, shift.startTime, shift.endTime)
                  : `#${shiftId}`}
              </span>
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size={touch ? "icon-touch" : "icon-sm"}
              className="shrink-0"
              disabled={isPending || !canToggleLeader}
              aria-label={
                leader?.isLeader ? copy.unmarkShiftLeader : copy.markShiftLeader
              }
              title={
                leader?.isLeader ? copy.unmarkShiftLeader : copy.markShiftLeader
              }
              onClick={() =>
                onLeaderToggle(
                  employeeId,
                  workDate,
                  shiftId,
                  !leader?.isLeader,
                )
              }
            >
              <IconStar
                className={cn(
                  "size-4",
                  leader?.isLeader
                    ? "fill-current text-warning"
                    : "text-muted-foreground",
                )}
              />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size={touch ? "icon-touch" : "icon-sm"}
              className="shrink-0"
              disabled={isPending}
              aria-label="Xóa ca"
              onClick={() => onRemoveShift(employeeId, workDate, shiftId)}
            >
              <IconX className="size-4" />
            </Button>
          </div>
        );
      })}
      {availableShifts.length > 0 ? (
        <Select
          value={ADD_SHIFT_VALUE}
          onValueChange={(value) => {
            if (value === ADD_SHIFT_VALUE) return;
            onAddShift(employeeId, workDate, Number(value));
          }}
          disabled={isPending}
        >
          <SelectTrigger
            size={touch ? "touch" : "sm"}
            className="w-full min-w-0"
          >
            <SelectValue placeholder={copy.addShift}>
              <span className="flex items-center gap-1">
                <IconPlus className="size-3.5" />
                {copy.addShift}
              </span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ADD_SHIFT_VALUE} disabled size={touch ? "touch" : "default"}>
              {copy.addShift}
            </SelectItem>
            {availableShifts.map((shift) => (
              <SelectItem
                key={`${cellKey}:${shift.id}`}
                value={String(shift.id)}
                size={touch ? "touch" : "default"}
              >
                {formatShiftLabel(shift.name, shift.startTime, shift.endTime)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : assignedShiftIds.length === 0 ? (
        <span className="text-muted-foreground text-xs">{copy.emptyShift}</span>
      ) : null}
    </div>
  );
}
