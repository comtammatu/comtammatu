"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CalendarCheck as IconCalendarCheck,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  Clock as IconClock,
  Plus as IconPlus,
  Repeat2 as IconRepeat,
  Search as IconSearch,
  Star as IconStar,
  UserMinus as IconUserMinus,
  UserPlus as IconUserPlus,
} from "lucide-react";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { addVNDateDays, getVNDateString } from "@comtammatu/shared/time";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
import { confirm } from "@/components/confirm-dialog";
import { AppEmptyState, AppSheet } from "@/components/surface";
import { BranchOperatorPanel } from "@lib/branch-operator/components/branch-operator-page";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import {
  rosterAssignmentKey,
  type RosterEmployee,
  type RosterShift,
  type RosterWeekData,
} from "@lib/hr/roster/roster-model";
import { useRosterWeekEditor } from "@lib/hr/roster/use-roster-week-editor";
import {
  formatRosterDayHeader,
  formatRosterWeekRange,
} from "@lib/hr/roster/week";
import { WeeklyScheduleSheet } from "./weekly-schedule-sheet";

const copy = messages.hr.roster;

function employeeMeta(employee: RosterEmployee): string {
  return (
    [employee.employeeCode, employee.positionLabel]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

export function BranchRosterWeekClient({
  branchId,
  weekStart,
  data,
  canAssign,
  loadFailed,
  relatedActions,
  onDirtyChange,
}: {
  branchId: number;
  weekStart: string;
  data: RosterWeekData;
  canAssign: boolean;
  loadFailed: boolean;
  relatedActions: ReactNode;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const today = getVNDateString();
  const [selectedDay, setSelectedDay] = useState("");
  const [assignSheetShiftId, setAssignSheetShiftId] = useState<number | null>(
    null,
  );
  const [schedulePickerOpen, setSchedulePickerOpen] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const activeDayButtonRef = useRef<HTMLButtonElement>(null);

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
    discardChanges,
    refreshRoster,
  } = useRosterWeekEditor({ branchId, weekStart, data });
  const discardChangesRef = useRef(discardChanges);
  discardChangesRef.current = discardChanges;

  const activeDay = weekDates.includes(selectedDay)
    ? selectedDay
    : weekDates.includes(today)
      ? today
      : (weekDates[0] ?? weekStart);

  const assignSheetShift =
    data.shifts.find((shift) => shift.id === assignSheetShiftId) ?? null;

  useEffect(() => {
    activeDayButtonRef.current?.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "center",
    });
  }, [activeDay]);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const guardStateKey = "__ctmtRosterGuard";
    const guardId = `${Date.now()}-${Math.random()}`;
    let allowNavigation = false;
    let promptOpen = false;

    function guardedState() {
      const currentState = window.history.state;
      const state =
        currentState && typeof currentState === "object" ? currentState : {};
      return { ...state, [guardStateKey]: guardId };
    }

    window.history.pushState(guardedState(), "", window.location.href);

    function preventUnsavedExit(event: BeforeUnloadEvent) {
      if (allowNavigation) return;
      event.preventDefault();
      event.returnValue = "";
    }

    async function approveDiscard(): Promise<boolean> {
      if (promptOpen) return false;
      promptOpen = true;
      const approved = await confirm({
        title: copy.unsavedExitTitle,
        description: copy.unsavedExitDescription,
        confirmText: copy.discardChanges,
        cancelText: copy.continueEditing,
        variant: "destructive",
      });
      promptOpen = false;
      return approved;
    }

    async function removeHistoryGuard() {
      if (window.history.state?.[guardStateKey] !== guardId) return;
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 250);
        window.addEventListener(
          "popstate",
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true },
        );
        window.history.back();
      });
    }

    async function navigateAfterDiscard(url: URL) {
      if (!(await approveDiscard())) return;
      allowNavigation = true;
      discardChangesRef.current();
      await removeHistoryGuard();
      if (url.origin === window.location.origin) {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      } else {
        window.location.assign(url.href);
      }
    }

    function interceptLinkNavigation(event: globalThis.MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }
      const url = new URL(anchor.href, window.location.href);
      if (url.href === window.location.href) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void navigateAfterDiscard(url);
    }

    async function interceptHistoryNavigation() {
      if (allowNavigation) return;
      window.history.pushState(guardedState(), "", window.location.href);
      if (!(await approveDiscard())) return;
      allowNavigation = true;
      discardChangesRef.current();
      window.history.go(-2);
    }

    window.addEventListener("beforeunload", preventUnsavedExit);
    window.addEventListener("popstate", interceptHistoryNavigation);
    document.addEventListener("click", interceptLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", preventUnsavedExit);
      window.removeEventListener("popstate", interceptHistoryNavigation);
      document.removeEventListener("click", interceptLinkNavigation, true);
      if (
        !allowNavigation &&
        window.history.state?.[guardStateKey] === guardId
      ) {
        allowNavigation = true;
        window.history.back();
      }
    };
  }, [dirty, router]);

  const assignmentCandidates = useMemo(() => {
    if (assignSheetShiftId == null) return [];
    const query = assignmentSearch.trim();
    return data.employees.filter((employee) => {
      const assignedShiftIds =
        assignmentMap.get(`${employee.employeeId}:${activeDay}`) ?? [];
      if (assignedShiftIds.includes(assignSheetShiftId)) return false;
      return (
        !query ||
        matchesSearch(
          [
            employee.fullName,
            employee.employeeCode ?? "",
            employee.positionLabel ?? "",
          ],
          query,
        )
      );
    });
  }, [
    activeDay,
    assignSheetShiftId,
    assignmentMap,
    assignmentSearch,
    data.employees,
  ]);

  const scheduleEmployees = useMemo(() => {
    const query = scheduleSearch.trim();
    if (!query) return data.employees;
    return data.employees.filter((employee) =>
      matchesSearch(
        [
          employee.fullName,
          employee.employeeCode ?? "",
          employee.positionLabel ?? "",
        ],
        query,
      ),
    );
  }, [data.employees, scheduleSearch]);

  function assignedEmployeesFor(shift: RosterShift, workDate = activeDay) {
    return data.employees.filter((employee) =>
      assignmentMap
        .get(`${employee.employeeId}:${workDate}`)
        ?.includes(shift.id),
    );
  }

  function assignedEmployeeCount(workDate: string): number {
    return data.employees.filter(
      (employee) =>
        (assignmentMap.get(`${employee.employeeId}:${workDate}`)?.length ?? 0) >
        0,
    ).length;
  }

  function openSchedule(employeeId: number) {
    setSchedulePickerOpen(false);
    setScheduleEmployeeId(employeeId);
  }

  async function confirmDiscardChanges(): Promise<boolean> {
    if (!dirty) return true;
    const approved = await confirm({
      title: copy.unsavedExitTitle,
      description: copy.unsavedExitDescription,
      confirmText: copy.discardChanges,
      cancelText: copy.continueEditing,
      variant: "destructive",
    });
    if (approved) discardChanges();
    return approved;
  }

  async function shiftWeek(deltaDays: number) {
    if (!(await confirmDiscardChanges())) return;
    handleWeekShift(deltaDays);
  }

  async function openSchedulePicker() {
    if (!(await confirmDiscardChanges())) return;
    setSchedulePickerOpen(true);
  }

  async function copyPreviousWeek() {
    if (dirty) return;
    const sourceWeekStart = addVNDateDays(weekStart, -7);
    const approved = await confirm({
      title: copy.copyPreviousWeekTitle,
      description: copy.copyPreviousWeekDescription(
        formatRosterWeekRange(sourceWeekStart),
        formatRosterWeekRange(weekStart),
      ),
      confirmText: copy.copyPreviousWeek,
      cancelText: copy.cancel,
      variant: "destructive",
    });
    if (approved) handleCopyPreviousWeek();
  }

  if (!canAssign) {
    return <AppEmptyState mode="no-access" />;
  }

  if (loadFailed) {
    return (
      <AppEmptyState mode="error" description={copy.loadAssignmentsFailed}>
        <Button type="button" size="touch" onClick={refreshRoster}>
          {ACTIONS_VI.retry}
        </Button>
      </AppEmptyState>
    );
  }

  if (data.employees.length === 0) {
    return (
      <AppEmptyState
        mode="no-data"
        title={copy.emptyEmployeesTitle}
        description={copy.emptyEmployeesDescription}
      />
    );
  }

  const assignedToday = assignedEmployeeCount(activeDay);
  const unassignedToday = data.employees.length - assignedToday;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={() => void shiftWeek(-7)}
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
          onClick={() => void shiftWeek(7)}
          disabled={isPending}
          aria-label={copy.nextWeek}
        >
          <IconChevronRight className="size-4" />
        </Button>
      </div>

      <div
        className="no-scrollbar flex touch-pan-x gap-2 overflow-x-auto overscroll-x-contain pb-1"
        role="group"
        aria-label={copy.selectDayAria}
      >
        {weekDates.map((date) => {
          const active = activeDay === date;
          return (
            <Button
              key={date}
              ref={active ? activeDayButtonRef : undefined}
              type="button"
              variant={active ? "secondary" : "outline"}
              size="touch-lg"
              aria-pressed={active}
              className="min-w-28 shrink-0 flex-col items-start gap-1 px-3 py-2 text-sm"
              onClick={() => setSelectedDay(date)}
            >
              <span className="font-semibold">
                {formatRosterDayHeader(date)}
              </span>
              <span className="text-muted-foreground text-xs font-normal">
                {copy.assignedStaffCount(assignedEmployeeCount(date))}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:flex">
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="min-w-0 px-1.5 text-xs sm:w-auto sm:px-3 sm:text-sm"
          onClick={() => void openSchedulePicker()}
          disabled={isPending || data.shifts.length === 0}
        >
          <IconRepeat className="size-3.5 sm:size-4" />
          {copy.schedule}
        </Button>
        {relatedActions}
      </div>

      <BranchOperatorPanel
        title={formatRosterDayHeader(activeDay)}
        description={copy.dayStaffingSummary(
          assignedToday,
          data.employees.length,
          unassignedToday,
        )}
        badge={{ children: copy.assignedStaffCount(assignedToday) }}
        size="sm"
      >
        {dirty ? (
          <p className="mb-3 text-xs font-medium text-warning" role="status">
            {copy.saveBeforeLeader}
          </p>
        ) : null}
        {data.shifts.length === 0 ? (
          <AppEmptyState
            compact
            mode="no-data"
            title={copy.emptyShiftsTitle}
            description={copy.emptyShiftsDescription}
          />
        ) : (
          <div className="flex flex-col gap-4">
            {data.shifts.map((shift) => {
              const assignedEmployees = assignedEmployeesFor(shift);
              const hasLeader = assignedEmployees.some(
                (employee) =>
                  leaderMap.get(
                    rosterAssignmentKey(
                      employee.employeeId,
                      activeDay,
                      shift.id,
                    ),
                  )?.isLeader,
              );

              return (
                <section key={shift.id} className="flex flex-col gap-2">
                  <div className="flex min-w-0 items-start justify-between gap-3 border-b pb-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <IconClock className="mt-0.5 size-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <h3 className="font-heading truncate text-sm font-semibold">
                          {shift.name}
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          {shift.startTime}–{shift.endTime}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <Badge variant="outline">
                        {copy.assignedStaffCount(assignedEmployees.length)}
                      </Badge>
                      {assignedEmployees.length > 0 && !hasLeader ? (
                        <Badge variant="warning">{copy.noLeaderAssigned}</Badge>
                      ) : null}
                    </div>
                  </div>

                  {assignedEmployees.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-sm">
                      {copy.noStaffInShift}
                    </p>
                  ) : (
                    <ItemGroup className="gap-2">
                      {assignedEmployees.map((employee) => {
                        const leaderKey = rosterAssignmentKey(
                          employee.employeeId,
                          activeDay,
                          shift.id,
                        );
                        const leader = leaderMap.get(leaderKey);
                        const canToggleLeader =
                          !dirty && leader != null && leader.assignmentId > 0;

                        return (
                          <Item
                            key={employee.employeeId}
                            variant="outline"
                            className="items-center justify-between p-2.5"
                          >
                            <ItemContent className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <ItemTitle className="truncate text-sm font-medium">
                                  {employee.fullName}
                                </ItemTitle>
                                {leader?.isLeader ? (
                                  <Badge
                                    variant="warning"
                                    className="px-1.5 py-0 text-2xs"
                                  >
                                    {copy.shiftLeaderBadge}
                                  </Badge>
                                ) : null}
                              </div>
                              <ItemDescription className="truncate text-xs">
                                {employeeMeta(employee)}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions className="gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-touch"
                                disabled={isPending || !canToggleLeader}
                                title={
                                  dirty
                                    ? copy.saveBeforeLeader
                                    : leader?.isLeader
                                      ? copy.unmarkShiftLeader
                                      : copy.markShiftLeader
                                }
                                aria-label={
                                  leader?.isLeader
                                    ? copy.unmarkShiftLeader
                                    : copy.markShiftLeader
                                }
                                onClick={() =>
                                  handleLeaderToggle(
                                    employee.employeeId,
                                    activeDay,
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
                                title={copy.removeShift}
                                onClick={() =>
                                  handleRemoveShift(
                                    employee.employeeId,
                                    activeDay,
                                    shift.id,
                                  )
                                }
                              >
                                <IconUserMinus className="size-4" />
                              </Button>
                            </ItemActions>
                          </Item>
                        );
                      })}
                    </ItemGroup>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="touch"
                    className="w-full"
                    onClick={() => {
                      setAssignmentSearch("");
                      setAssignSheetShiftId(shift.id);
                    }}
                    disabled={isPending}
                  >
                    <IconUserPlus className="size-4" />
                    {copy.addPeopleToShift}
                  </Button>
                </section>
              );
            })}
          </div>
        )}
      </BranchOperatorPanel>

      {isPending ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner className="size-4" />
          {STATES_VI.loading}
        </div>
      ) : null}

      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className={dirty ? "text-warning" : "text-muted-foreground"}>
            {dirty ? copy.unsavedChanges : copy.savedState}
          </span>
          <span className="text-muted-foreground">
            {formatRosterDayHeader(activeDay)}
          </span>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="min-w-0 flex-1"
            onClick={() => void copyPreviousWeek()}
            disabled={isPending || dirty}
            title={dirty ? copy.copyRequiresSaved : copy.copyPreviousWeek}
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
      </div>

      <AppSheet
        open={assignSheetShiftId != null}
        onOpenChange={(open) => {
          if (!open) setAssignSheetShiftId(null);
        }}
        title={
          assignSheetShift
            ? copy.assignSheetTitle(assignSheetShift.name)
            : copy.addPeopleToShift
        }
        description={copy.assignSheetDescription(
          formatRosterDayHeader(activeDay),
        )}
        side="bottom"
        contentClassName="max-h-dvh-95"
      >
        <div className="flex flex-col gap-3">
          <InputGroup size="touch">
            <InputGroupAddon>
              <IconSearch aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              value={assignmentSearch}
              onChange={(event) => setAssignmentSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchAriaLabel}
            />
          </InputGroup>

          {assignmentCandidates.length === 0 ? (
            <AppEmptyState
              compact
              mode={assignmentSearch.trim() ? "no-results" : "no-data"}
              title={copy.noAssignmentCandidatesTitle}
              description={copy.noAssignmentCandidatesDescription}
            />
          ) : (
            <ItemGroup className="gap-2">
              {assignmentCandidates.map((employee) => {
                const currentShiftIds =
                  assignmentMap.get(`${employee.employeeId}:${activeDay}`) ??
                  [];
                const currentShiftLabels = currentShiftIds
                  .map(
                    (shiftId) =>
                      data.shifts.find((shift) => shift.id === shiftId)?.name,
                  )
                  .filter((label): label is string => Boolean(label));

                return (
                  <Item
                    key={employee.employeeId}
                    variant="outline"
                    className="items-center justify-between p-2.5"
                  >
                    <ItemContent className="min-w-0">
                      <ItemTitle className="truncate text-sm font-medium">
                        {employee.fullName}
                      </ItemTitle>
                      <ItemDescription className="truncate text-xs">
                        {currentShiftLabels.length > 0
                          ? copy.alreadyAssignedTo(
                              currentShiftLabels.join(", "),
                            )
                          : employeeMeta(employee)}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions>
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        disabled={isPending || assignSheetShiftId == null}
                        onClick={() => {
                          if (assignSheetShiftId == null) return;
                          handleAddShift(
                            employee.employeeId,
                            activeDay,
                            assignSheetShiftId,
                          );
                        }}
                      >
                        <IconPlus className="size-4" />
                        {copy.addEmployee}
                      </Button>
                    </ItemActions>
                  </Item>
                );
              })}
            </ItemGroup>
          )}
        </div>
      </AppSheet>

      <AppSheet
        open={schedulePickerOpen}
        onOpenChange={setSchedulePickerOpen}
        title={copy.schedulePickerTitle}
        description={copy.schedulePickerDescription}
        side="bottom"
        contentClassName="max-h-dvh-95"
      >
        <div className="flex flex-col gap-3">
          <InputGroup size="touch">
            <InputGroupAddon>
              <IconSearch aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              value={scheduleSearch}
              onChange={(event) => setScheduleSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchAriaLabel}
            />
          </InputGroup>

          {scheduleEmployees.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-results"
              title={copy.noStaffFoundTitle}
              description={copy.noStaffFoundDescription}
            />
          ) : (
            <ItemGroup className="gap-2">
              {scheduleEmployees.map((employee) => (
                <Item
                  key={employee.employeeId}
                  variant="outline"
                  className="items-center justify-between p-2.5"
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle className="truncate text-sm font-medium">
                      {employee.fullName}
                    </ItemTitle>
                    <ItemDescription className="truncate text-xs">
                      {scheduleLabel(employee.employeeId)} ·{" "}
                      {employeeMeta(employee)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => openSchedule(employee.employeeId)}
                    >
                      <IconCalendarCheck className="size-4" />
                      {copy.openSchedule}
                    </Button>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </div>
      </AppSheet>

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
