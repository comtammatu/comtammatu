"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays as IconCalendarDays,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  Filter as IconFilter,
  Layers as IconLayers,
  Plus as IconPlus,
  Repeat2 as IconRepeat,
  Search as IconSearch,
  Star as IconStar,
  UserX as IconUserX,
  Users as IconUsers,
  X as IconX,
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppEmptyState } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { RosterDayCell } from "@lib/hr/roster/roster-day-cell";
import {
  rosterAssignmentKey,
  type RosterEmployee,
  type RosterWeekData,
} from "@lib/hr/roster/roster-model";
import { formatShiftLabel } from "@lib/hr/roster/roster-week-helpers";
import { useRosterWeekEditor } from "@lib/hr/roster/use-roster-week-editor";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
} from "@lib/hr/roster/week";
import { WeeklyScheduleSheet } from "./weekly-schedule-sheet";

const copy = messages.hr.roster;

type RosterViewMode = "by_employee" | "by_shift";

export function BranchRosterWeekClient({
  branchId,
  weekStart,
  data,
  canAssign,
  loadFailed,
}: {
  branchId: number;
  weekStart: string;
  data: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
}) {
  const [selectedDay, setSelectedDay] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [viewMode, setViewMode] = useState<RosterViewMode>("by_employee");

  const {
    isPending,
    assignmentMap,
    leaderMap,
    dirty,
    weekDates,
    scheduleEmployeeId,
    setScheduleEmployeeId,
    scheduleEmployee,
    selectedSchedule,
    scheduleLabel,
    handleWeekShift,
    handleAddShift,
    handleRemoveShift,
    handleSave,
    handleCopyPreviousWeek,
    handleLeaderToggle,
    refreshRoster,
  } = useRosterWeekEditor({ branchId, weekStart, data });

  // Unique position labels
  const uniquePositions = useMemo(() => {
    const set = new Set<string>();
    for (const emp of data.employees) {
      if (emp.positionLabel) set.add(emp.positionLabel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [data.employees]);

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim();
    return data.employees.filter((emp) => {
      if (positionFilter !== "all" && emp.positionLabel !== positionFilter) {
        return false;
      }
      if (!q) return true;
      return matchesSearch(
        [emp.fullName, emp.employeeCode ?? "", emp.positionLabel ?? ""],
        q,
      );
    });
  }, [data.employees, searchQuery, positionFilter]);

  // Weekly shift counts per employee
  const employeeWeekShiftCounts = useMemo(() => {
    const map = new Map<number, number>();
    for (const emp of data.employees) {
      let count = 0;
      for (const d of weekDates) {
        count += assignmentMap.get(`${emp.employeeId}:${d}`)?.length ?? 0;
      }
      map.set(emp.employeeId, count);
    }
    return map;
  }, [data.employees, weekDates, assignmentMap]);

  // Target date for by_shift view (if "all" is selected, fallback to first day of week)
  const shiftViewDate =
    selectedDay === "all" ? (weekDates[0] ?? "") : selectedDay;

  function renderScheduleButton(employee: RosterEmployee) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="touch"
        className="shrink-0 px-3 text-sm"
        onClick={() => setScheduleEmployeeId(employee.employeeId)}
        disabled={isPending || data.shifts.length === 0}
      >
        <IconRepeat className="size-4" />
        {scheduleLabel(employee.employeeId)}
      </Button>
    );
  }

  function renderDayCell(employee: RosterEmployee, workDate: string) {
    return (
      <RosterDayCell
        employeeId={employee.employeeId}
        workDate={workDate}
        shifts={data.shifts}
        assignedShiftIds={
          assignmentMap.get(`${employee.employeeId}:${workDate}`) ?? []
        }
        leaderMap={leaderMap}
        dirty={dirty}
        isPending={isPending}
        touch
        onAddShift={handleAddShift}
        onRemoveShift={handleRemoveShift}
        onLeaderToggle={handleLeaderToggle}
      />
    );
  }

  if (!canAssign) {
    return <AppEmptyState mode="no-access" />;
  }

  if (loadFailed) {
    return (
      <AppEmptyState mode="error" description={copy.loadAssignmentsFailed} />
    );
  }

  const visibleDates =
    selectedDay === "all"
      ? weekDates
      : weekDates.filter((date) => date === selectedDay);

  const hasFilter = searchQuery.trim().length > 0 || positionFilter !== "all";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Week Navigator */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => handleWeekShift(-7)}
          disabled={isPending}
          aria-label={copy.previousWeek}
        >
          <IconChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 text-center text-sm font-medium">
          <div className="text-muted-foreground text-xs">{copy.weekLabel}</div>
          <div>{formatRosterWeekRange(weekStart)}</div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => handleWeekShift(7)}
          disabled={isPending}
          aria-label={copy.nextWeek}
        >
          <IconChevronRight className="size-4" />
        </Button>
      </div>

      {/* Day Filter Bar */}
      <div
        className="no-scrollbar flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
        role="group"
        aria-label={copy.selectDayAria}
      >
        <Button
          type="button"
          variant={selectedDay === "all" ? "secondary" : "outline"}
          size="touch"
          aria-pressed={selectedDay === "all"}
          className="shrink-0 gap-1.5 px-3"
          onClick={() => setSelectedDay("all")}
        >
          <IconCalendarDays className="size-4" />
          <span>{copy.allWeek}</span>
        </Button>
        {weekDates.map((date) => {
          const active = selectedDay === date;
          return (
            <Button
              key={date}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="touch"
              aria-pressed={active}
              className="shrink-0 px-3"
              onClick={() => setSelectedDay(date)}
            >
              <span>{formatRosterDayHeader(date)}</span>
            </Button>
          );
        })}
      </div>

      {/* Shift Coverage Breakdown Strip (for selected day or week) */}
      {data.shifts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 p-1 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <IconUsers className="size-3.5 text-muted-foreground" />
            <span>{copy.coverageSummaryTitle}:</span>
          </div>
          {selectedDay === "all" ? (
            <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
              <span>{copy.staffCount(data.employees.length)}</span>
              <span>·</span>
              <span>
                {copy.weeklyShiftsCount(
                  Array.from(employeeWeekShiftCounts.values()).reduce(
                    (a, b) => a + b,
                    0,
                  ),
                )}
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {data.shifts.map((shift) => {
                const assignedCount = data.employees.filter((emp) =>
                  assignmentMap
                    .get(`${emp.employeeId}:${selectedDay}`)
                    ?.includes(shift.id),
                ).length;
                const leaderCount = data.employees.filter(
                  (emp) =>
                    leaderMap.get(
                      rosterAssignmentKey(emp.employeeId, selectedDay, shift.id),
                    )?.isLeader,
                ).length;

                return (
                  <Badge
                    key={shift.id}
                    variant={assignedCount > 0 ? "outline" : "secondary"}
                    className="font-normal gap-1"
                  >
                    <span className="font-semibold">{shift.name}:</span>
                    <span>{copy.assignedStaffCount(assignedCount)}</span>
                    {leaderCount > 0 ? (
                      <span className="text-warning font-semibold">
                        {copy.leaderCountLabel(leaderCount)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-2xs">
                        {copy.noLeaderInShift}
                      </span>
                    )}
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {/* Search, Position Filter & View Mode Switch Toolbar */}
      <div className="flex flex-col gap-2">
        <InputGroup size="touch">
          <InputGroupAddon>
            <IconSearch aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
            aria-label={copy.searchAriaLabel}
          />
        </InputGroup>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {/* Position Filter Dropdown */}
          <div className="flex items-center gap-1.5">
            {uniquePositions.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant={positionFilter !== "all" ? "secondary" : "outline"}
                      size="touch"
                      className="gap-1.5 px-3 text-xs"
                    >
                      <IconFilter className="size-3.5" />
                      <span>
                        {positionFilter === "all"
                          ? copy.allPositions
                          : positionFilter}
                      </span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{copy.allPositions}</DropdownMenuLabel>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setPositionFilter("all")}
                  >
                    {copy.allPositions}
                  </DropdownMenuItem>
                  {uniquePositions.map((pos) => (
                    <DropdownMenuItem
                      key={pos}
                      size="touch"
                      onClick={() => setPositionFilter(pos)}
                    >
                      {pos}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={viewMode === "by_employee" ? "secondary" : "outline"}
              size="touch"
              className="gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("by_employee")}
              aria-pressed={viewMode === "by_employee"}
            >
              <IconUsers className="size-3.5" />
              <span>{copy.viewByEmployee}</span>
            </Button>
            <Button
              type="button"
              variant={viewMode === "by_shift" ? "secondary" : "outline"}
              size="touch"
              className="gap-1.5 px-3 text-xs"
              onClick={() => setViewMode("by_shift")}
              aria-pressed={viewMode === "by_shift"}
            >
              <IconLayers className="size-3.5" />
              <span>{copy.viewByShift}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Roster Panel */}
      <BranchOperatorPanel
        title={copy.title}
        description={
          selectedDay === "all"
            ? formatRosterWeekRange(weekStart)
            : `${formatRosterDayHeader(selectedDay)} · ${viewMode === "by_shift" ? copy.viewByShift : copy.viewByEmployee}`
        }
        badge={{ children: filteredEmployees.length }}
        size="sm"
      >
        {filteredEmployees.length === 0 ? (
          <AppEmptyState
            compact
            mode={hasFilter ? "no-results" : "no-data"}
            title={hasFilter ? copy.noStaffFoundTitle : copy.emptyEmployeesTitle}
            description={
              hasFilter
                ? copy.noStaffFoundDescription
                : copy.emptyEmployeesDescription
            }
          />
        ) : viewMode === "by_employee" ? (
          /* View Mode 1: By Employee */
          <ItemGroup className="grid gap-3">
            {filteredEmployees.map((employee) => {
              const weekShiftCount =
                employeeWeekShiftCounts.get(employee.employeeId) ?? 0;

              return (
                <Item
                  key={employee.employeeId}
                  variant="outline"
                  className="items-start bg-card p-3"
                >
                  <ItemContent className="min-w-0 gap-3">
                    <div className="flex w-full flex-wrap items-center justify-between gap-2 border-b pb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ItemTitle size="heading" className="line-clamp-none">
                            {employee.fullName}
                          </ItemTitle>
                          <Badge variant="secondary" className="text-2xs font-normal">
                            {copy.assignedShiftsCount(weekShiftCount)}
                          </Badge>
                        </div>
                        <ItemDescription>
                          {[employee.employeeCode, employee.positionLabel]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </ItemDescription>
                      </div>
                      {renderScheduleButton(employee)}
                    </div>

                    <div
                      className={cn(
                        "grid w-full gap-2",
                        selectedDay === "all"
                          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-7"
                          : "grid-cols-1",
                      )}
                    >
                      {visibleDates.map((date) => (
                        <div
                          key={date}
                          className={cn(
                            "flex flex-col gap-1.5 rounded-md bg-muted/30 p-2.5",
                            selectedDay !== "all" && "p-3",
                          )}
                        >
                          <div className="flex items-center justify-between border-b pb-1">
                            <span className="text-xs font-semibold text-foreground">
                              {formatRosterDayHeader(date)}
                            </span>
                            {selectedDay === "all" ? null : (
                              <Badge
                                variant="outline"
                                className="text-2xs font-normal"
                              >
                                {date}
                              </Badge>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {renderDayCell(employee, date)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ItemContent>
                </Item>
              );
            })}
          </ItemGroup>
        ) : (
          /* View Mode 2: By Shift Coverage */
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-muted-foreground">
                {copy.dayViewingPrefix} {formatRosterDayHeader(shiftViewDate)} ({shiftViewDate})
              </span>
            </div>

            {/* List for each shift */}
            {data.shifts.map((shift) => {
              const assignedToShift = filteredEmployees.filter((emp) =>
                assignmentMap
                  .get(`${emp.employeeId}:${shiftViewDate}`)
                  ?.includes(shift.id),
              );

              return (
                <ItemGroup
                  key={shift.id}
                  className="gap-2"
                  aria-label={shift.name}
                >
                  <div className="flex items-center justify-between border-b px-1 pb-1.5">
                    <div className="flex items-center gap-2">
                      <IconClock className="size-4 text-primary" />
                      <h3 className="font-heading text-sm font-semibold text-foreground">
                        {shift.name} ({shift.startTime}–{shift.endTime})
                      </h3>
                    </div>
                    <Badge variant="outline">
                      {copy.staffCount(assignedToShift.length)}
                    </Badge>
                  </div>

                  {assignedToShift.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      {copy.noStaffInShift}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {assignedToShift.map((emp) => {
                        const leaderKey = rosterAssignmentKey(
                          emp.employeeId,
                          shiftViewDate,
                          shift.id,
                        );
                        const leader = leaderMap.get(leaderKey);
                        const canToggleLeader =
                          !dirty && leader != null && leader.assignmentId > 0;

                        return (
                          <Item
                            key={emp.employeeId}
                            variant="outline"
                            className="items-center justify-between p-2.5"
                          >
                            <ItemContent className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <ItemTitle className="truncate text-sm font-medium">
                                  {emp.fullName}
                                </ItemTitle>
                                {leader?.isLeader ? (
                                  <Badge
                                    variant="warning"
                                    className="text-2xs px-1.5 py-0"
                                  >
                                    {copy.shiftLeaderBadge}
                                  </Badge>
                                ) : null}
                              </div>
                              <ItemDescription className="truncate text-xs">
                                {[emp.employeeCode, emp.positionLabel]
                                  .filter(Boolean)
                                  .join(" · ") || "—"}
                              </ItemDescription>
                            </ItemContent>

                            <ItemActions className="gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-touch"
                                disabled={isPending || !canToggleLeader}
                                aria-label={
                                  leader?.isLeader
                                    ? copy.unmarkShiftLeader
                                    : copy.markShiftLeader
                                }
                                title={
                                  leader?.isLeader
                                    ? copy.unmarkShiftLeader
                                    : copy.markShiftLeader
                                }
                                onClick={() =>
                                  handleLeaderToggle(
                                    emp.employeeId,
                                    shiftViewDate,
                                    shift.id,
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
                                size="icon-touch"
                                disabled={isPending}
                                aria-label={copy.removeShift}
                                onClick={() =>
                                  handleRemoveShift(
                                    emp.employeeId,
                                    shiftViewDate,
                                    shift.id,
                                  )
                                }
                              >
                                <IconX className="size-4" />
                              </Button>
                            </ItemActions>
                          </Item>
                        );
                      })}
                    </div>
                  )}
                </ItemGroup>
              );
            })}

            {/* Unassigned in day section */}
            {(() => {
              const unassignedEmployees = filteredEmployees.filter(
                (emp) =>
                  (assignmentMap.get(`${emp.employeeId}:${shiftViewDate}`)
                    ?.length ?? 0) === 0,
              );

              return (
                <ItemGroup
                  className="gap-2 border-t pt-2"
                  aria-label={copy.unassignedInDay}
                >
                  <div className="flex items-center justify-between border-b px-1 pb-1.5">
                    <div className="flex items-center gap-2">
                      <IconUserX className="size-4 text-muted-foreground" />
                      <h4 className="text-sm font-semibold text-muted-foreground">
                        {copy.unassignedInDay}
                      </h4>
                    </div>
                    <Badge variant="secondary">
                      {copy.staffCount(unassignedEmployees.length)}
                    </Badge>
                  </div>

                  {unassignedEmployees.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      {copy.allStaffAssignedInDay}
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {unassignedEmployees.map((emp) => (
                        <Item
                          key={emp.employeeId}
                          variant="outline"
                          className="items-center justify-between p-2.5"
                        >
                          <ItemContent className="min-w-0">
                            <ItemTitle className="truncate text-sm font-medium">
                              {emp.fullName}
                            </ItemTitle>
                            <ItemDescription className="truncate text-xs">
                              {[emp.employeeCode, emp.positionLabel]
                                .filter(Boolean)
                                .join(" · ") || "—"}
                            </ItemDescription>
                          </ItemContent>

                          <ItemActions>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                render={
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="touch"
                                    className="gap-1 text-xs"
                                    disabled={isPending}
                                  >
                                    <IconPlus className="size-3.5" />
                                    <span>{copy.assignToShift}</span>
                                  </Button>
                                }
                              />
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{copy.selectShift}</DropdownMenuLabel>
                                {data.shifts.map((shift) => (
                                  <DropdownMenuItem
                                    key={shift.id}
                                    size="touch"
                                    onClick={() =>
                                      handleAddShift(
                                        emp.employeeId,
                                        shiftViewDate,
                                        shift.id,
                                      )
                                    }
                                  >
                                    {formatShiftLabel(
                                      shift.name,
                                      shift.startTime,
                                      shift.endTime,
                                    )}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </ItemActions>
                        </Item>
                      ))}
                    </div>
                  )}
                </ItemGroup>
              );
            })()}
          </div>
        )}
      </BranchOperatorPanel>

      {isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-4" />
          {STATES_VI.loading}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap gap-2 border-t bg-background px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="min-w-0 flex-1"
          onClick={handleCopyPreviousWeek}
          disabled={isPending}
        >
          {copy.copyPreviousWeek}
        </Button>
        <Button
          type="button"
          size="touch"
          className="min-w-0 flex-1"
          onClick={handleSave}
          disabled={isPending || !dirty}
        >
          {isPending ? <Spinner className="size-4" /> : null}
          {copy.save}
        </Button>
      </div>

      <WeeklyScheduleSheet
        open={scheduleEmployeeId != null}
        onOpenChange={(open) => !open && setScheduleEmployeeId(null)}
        branchId={branchId}
        employee={scheduleEmployee}
        shifts={data.shifts}
        schedule={selectedSchedule}
        onSaved={refreshRoster}
      />
    </div>
  );
}
