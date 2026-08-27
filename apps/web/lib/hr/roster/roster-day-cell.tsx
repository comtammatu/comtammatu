"use client";

import { Plus as IconPlus, Star as IconStar, X as IconX } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { messages } from "@lib/messages";
import {
  rosterAssignmentKey,
  rosterCellKey,
  type RosterShift,
} from "./roster-model";
import { formatShiftLabel } from "./roster-week-helpers";

const copy = messages.hr.roster;

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
    <div className="flex min-w-32 flex-col gap-1.5">
      {assignedShiftIds.map((shiftId) => {
        const shift = shifts.find((item) => item.id === shiftId);
        const leaderKey = rosterAssignmentKey(employeeId, workDate, shiftId);
        const leader = leaderMap.get(leaderKey);
        const canToggleLeader =
          !dirty && leader != null && leader.assignmentId > 0;
        return (
          <div key={leaderKey} className="flex items-center gap-1">
            <Badge
              variant="outline"
              className={cn(
                "min-w-0 flex-1 justify-start font-normal",
                touch ? "py-1.5 px-2 text-xs" : "py-0.5 text-xs",
              )}
            >
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
              aria-label={copy.removeShift}
              onClick={() => onRemoveShift(employeeId, workDate, shiftId)}
            >
              <IconX className="size-4" />
            </Button>
          </div>
        );
      })}
      {availableShifts.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size={touch ? "touch" : "sm"}
                className="w-full min-w-0 justify-center gap-1 text-xs"
                disabled={isPending}
              >
                <IconPlus className="size-3.5" />
                <span>{copy.addShift}</span>
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {availableShifts.map((shift) => (
              <DropdownMenuItem
                key={`${cellKey}:${shift.id}`}
                size={touch ? "touch" : "default"}
                onClick={() => onAddShift(employeeId, workDate, shift.id)}
              >
                {formatShiftLabel(shift.name, shift.startTime, shift.endTime)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : assignedShiftIds.length === 0 ? (
        <span className="text-muted-foreground text-xs">{copy.emptyShift}</span>
      ) : null}
    </div>
  );
}
