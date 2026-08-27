/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpDown,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Filter,
  Layers,
  Phone,
  Search,
  UsersRound,
} from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNTime as formatTimeVN } from "@comtammatu/shared/time";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@comtammatu/ui/components/avatar";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Item, ItemContent } from "@comtammatu/ui/components/item";
import {
  AppEmptyState,
  AppDrawer,
} from "@/components/surface";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { TeamMemberTile } from "../_components/team-member-tile";
import { BranchEmployeeTasksSheet } from "./branch-employee-tasks-sheet";

const copy = messages.operator.teamBoard;
const detailCopy = messages.operator.teamBoard.memberDetail;

export type TeamMemberTodayStatus =
  | "working"
  | "checked_out"
  | "on_leave"
  | "not_started";

export type TeamMemberCountStatus =
  | "not_assigned"
  | "not_submitted"
  | "submitted"
  | "needs_changes"
  | "approved";

export type TeamShiftInfo = {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
};

export interface TeamMemberRow {
  id: string;
  /** Numeric employees.id; null when profile has no active employee row. */
  employeeId: number | null;
  name: string;
  code: string | null;
  phone: string | null;
  avatarUrl: string | null;
  positionLabel: string | null;
  todayStatus: TeamMemberTodayStatus;
  todayShiftId: number | null;
  todayShiftName: string | null;
  todayShiftStartTime: string | null;
  todayShiftEndTime: string | null;
  checkIn: string | null;
  checkOut: string | null;
  onApprovedLeave: boolean;
  countStatus: TeamMemberCountStatus;
}

export type TeamMemberSortOption =
  | "shift"
  | "name_asc"
  | "name_desc"
  | "status"
  | "position";

export type TeamMemberFilter =
  | "all"
  | "working"
  | "not_started"
  | "on_leave"
  | "count_assigned";

type BadgeTone = NonNullable<BadgeProps["variant"]>;

function todayStatusMeta(status: TeamMemberTodayStatus): {
  label: string;
  variant: BadgeTone;
} {
  switch (status) {
    case "working":
      return { label: "Đang làm", variant: "success" };
    case "checked_out":
      return { label: "Đã kết ca", variant: "secondary" };
    case "on_leave":
      return { label: "Nghỉ phép", variant: "warning" };
    case "not_started":
      return { label: "Chưa vào ca", variant: "outline" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function countStatusMeta(status: TeamMemberCountStatus): {
  label: string;
  variant: BadgeTone;
} | null {
  switch (status) {
    case "not_assigned":
      return null;
    case "not_submitted":
      return { label: "Chưa nộp kiểm kê", variant: "warning" };
    case "submitted":
      return { label: "Có kiểm kê", variant: "info" };
    case "needs_changes":
      return { label: "Cần sửa kiểm kê", variant: "warning" };
    case "approved":
      return { label: "Kiểm kê đã duyệt", variant: "success" };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function formatOptionalTime(value: string | null): string {
  return value ? formatTimeVN(value) : "--";
}

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return initials.toLocaleUpperCase("vi") || "NV";
}

function phoneHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function matchesFilter(
  member: TeamMemberRow,
  filter: TeamMemberFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "working":
      return member.todayStatus === "working";
    case "not_started":
      return member.todayStatus === "not_started";
    case "on_leave":
      return member.todayStatus === "on_leave";
    case "count_assigned":
      return member.countStatus !== "not_assigned";
    default: {
      const _exhaustive: never = filter;
      return _exhaustive;
    }
  }
}

function matchesShiftFilter(
  member: TeamMemberRow,
  shiftFilter: string,
): boolean {
  if (shiftFilter === "all") return true;
  if (shiftFilter === "none") {
    return member.todayShiftName == null && member.todayStatus !== "working";
  }
  return member.todayShiftName === shiftFilter;
}

function matchesPositionFilter(
  member: TeamMemberRow,
  positionFilter: string,
): boolean {
  if (positionFilter === "all") return true;
  return member.positionLabel === positionFilter;
}

function memberMatchesQuery(member: TeamMemberRow, query: string): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return true;

  return matchesSearch(
    [
      member.name,
      member.code ?? "",
      member.phone ?? "",
      member.positionLabel ?? "",
      member.todayShiftName ?? "",
    ],
    normalizedQuery,
  );
}

function sortMembers(
  members: TeamMemberRow[],
  sortBy: TeamMemberSortOption,
): TeamMemberRow[] {
  return [...members].sort((a, b) => {
    switch (sortBy) {
      case "shift": {
        const aHasShift = a.todayShiftName != null || a.checkIn != null;
        const bHasShift = b.todayShiftName != null || b.checkIn != null;
        if (aHasShift && !bHasShift) return -1;
        if (!aHasShift && bHasShift) return 1;
        const aTime = a.todayShiftStartTime ?? a.checkIn ?? "";
        const bTime = b.todayShiftStartTime ?? b.checkIn ?? "";
        if (aTime && bTime && aTime !== bTime) {
          return aTime.localeCompare(bTime);
        }
        return a.name.localeCompare(b.name, "vi");
      }
      case "name_asc":
        return a.name.localeCompare(b.name, "vi");
      case "name_desc":
        return b.name.localeCompare(a.name, "vi");
      case "status": {
        const order: Record<TeamMemberTodayStatus, number> = {
          working: 0,
          not_started: 1,
          checked_out: 2,
          on_leave: 3,
        };
        const diff = order[a.todayStatus] - order[b.todayStatus];
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, "vi");
      }
      case "position": {
        const aPos = a.positionLabel ?? "";
        const bPos = b.positionLabel ?? "";
        if (aPos !== bPos) return aPos.localeCompare(bPos, "vi");
        return a.name.localeCompare(b.name, "vi");
      }
      default:
        return a.name.localeCompare(b.name, "vi");
    }
  });
}

function MemberAvatar({
  member,
  size = "default",
  className,
}: {
  member: TeamMemberRow;
  size?: "default" | "lg";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className}>
      {member.avatarUrl ? (
        <AvatarImage src={member.avatarUrl} alt={member.name} />
      ) : null}
      <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
    </Avatar>
  );
}

function renderMemberCardFooterBadges(member: TeamMemberRow) {
  const countMeta = countStatusMeta(member.countStatus);
  const hasShift = member.todayShiftName != null;
  const hasTimes = member.checkIn != null;

  return (
    <>
      {hasShift ? (
        <Badge variant="outline" className="font-normal text-xs">
          {member.todayShiftName}
          {member.todayShiftStartTime && member.todayShiftEndTime
            ? ` (${member.todayShiftStartTime}–${member.todayShiftEndTime})`
            : ""}
        </Badge>
      ) : null}
      {hasTimes ? (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Clock3 className="size-3 shrink-0" />
          <span>
            {formatOptionalTime(member.checkIn)}–{formatOptionalTime(member.checkOut)}
          </span>
        </span>
      ) : null}
      {countMeta ? (
        <Badge variant={countMeta.variant} className="text-xs">
          {countMeta.label}
        </Badge>
      ) : null}
    </>
  );
}

function MemberCard({
  member,
  onOpenDrawer,
}: {
  member: TeamMemberRow;
  onOpenDrawer: (member: TeamMemberRow) => void;
}) {
  const codeOrPlaceholder = member.code
    ? `(${member.code})`
    : "Chưa có mã NV";
  const status = todayStatusMeta(member.todayStatus);

  return (
    <TeamMemberTile
      name={member.name}
      subtitle={`${member.positionLabel ?? "Chưa có chức danh"} · ${codeOrPlaceholder}`}
      badges={<Badge variant={status.variant}>{status.label}</Badge>}
      footerBadges={renderMemberCardFooterBadges(member)}
      ariaLabel={`Mở hồ sơ ${member.name}`}
      layout="row"
      onSelect={() => onOpenDrawer(member)}
    />
  );
}

function MemberDetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <Item variant="outline" size="sm" className="min-w-0">
      <ItemContent className="min-w-0 gap-1">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="[&_svg]:size-3.5">{icon}</span>
          <span className="truncate">{label}</span>
        </div>
        <div className="truncate text-sm font-medium">{value}</div>
      </ItemContent>
    </Item>
  );
}

export function MembersClient({
  branchId,
  employees,
  availableShifts = [],
  canManageEmployeeOverrides = false,
}: {
  branchId: number;
  employees: TeamMemberRow[];
  availableShifts?: TeamShiftInfo[];
  canManageEmployeeOverrides?: boolean;
}) {
  const [activeMember, setActiveMember] = useState<TeamMemberRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TeamMemberFilter>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [positionFilter, setPositionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<TeamMemberSortOption>("shift");
  const [groupByShift, setGroupByShift] = useState(false);
  const [tasksEmployeeId, setTasksEmployeeId] = useState<number | null>(null);

  const stats = useMemo(
    () => ({
      total: employees.length,
      working: employees.filter((member) => member.todayStatus === "working")
        .length,
      notStarted: employees.filter(
        (member) => member.todayStatus === "not_started",
      ).length,
      onLeave: employees.filter((member) => member.onApprovedLeave).length,
      countAssigned: employees.filter(
        (member) => member.countStatus !== "not_assigned",
      ).length,
    }),
    [employees],
  );

  const uniquePositions = useMemo(() => {
    const set = new Set<string>();
    for (const emp of employees) {
      if (emp.positionLabel) set.add(emp.positionLabel);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [employees]);

  const uniqueShiftNames = useMemo(() => {
    const set = new Set<string>();
    for (const shift of availableShifts) {
      set.add(shift.name);
    }
    for (const emp of employees) {
      if (emp.todayShiftName) set.add(emp.todayShiftName);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "vi"));
  }, [availableShifts, employees]);

  const filterChipOptions: {
    value: TeamMemberFilter;
    label: string;
    count: number;
    variant: BadgeTone;
  }[] = [
    {
      value: "all",
      label: "nhân viên",
      count: stats.total,
      variant: "secondary",
    },
    {
      value: "working",
      label: "đang làm",
      count: stats.working,
      variant: "success",
    },
    {
      value: "not_started",
      label: "chờ vào ca",
      count: stats.notStarted,
      variant: "outline",
    },
    {
      value: "on_leave",
      label: "nghỉ phép",
      count: stats.onLeave,
      variant: stats.onLeave > 0 ? "warning" : "secondary",
    },
    {
      value: "count_assigned",
      label: "có kiểm kê",
      count: stats.countAssigned,
      variant: stats.countAssigned > 0 ? "info" : "secondary",
    },
  ];
  const filterChips = filterChipOptions.filter(
    (chip) => chip.value === "all" || chip.count > 0,
  );

  const filteredMembers = useMemo(() => {
    const matched = employees.filter(
      (member) =>
        memberMatchesQuery(member, searchQuery) &&
        matchesFilter(member, statusFilter) &&
        matchesShiftFilter(member, shiftFilter) &&
        matchesPositionFilter(member, positionFilter),
    );
    return sortMembers(matched, sortBy);
  }, [employees, searchQuery, statusFilter, shiftFilter, positionFilter, sortBy]);

  const groupedByShiftMembers = useMemo(() => {
    if (!groupByShift) return null;
    const groups = new Map<string, TeamMemberRow[]>();

    for (const member of filteredMembers) {
      const groupKey = member.todayShiftName ?? copy.noShiftTodayGroup;
      const existing = groups.get(groupKey) ?? [];
      existing.push(member);
      groups.set(groupKey, existing);
    }

    return Array.from(groups.entries()).map(([shiftName, members]) => ({
      shiftName,
      members,
    }));
  }, [filteredMembers, groupByShift]);

  const hasActiveFilter =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    shiftFilter !== "all" ||
    positionFilter !== "all";

  const activeTodayStatus = activeMember
    ? todayStatusMeta(activeMember.todayStatus)
    : null;
  const activeCountStatus = activeMember
    ? countStatusMeta(activeMember.countStatus)
    : null;

  const sortLabelMap: Record<TeamMemberSortOption, string> = {
    shift: copy.sortShift,
    name_asc: copy.sortNameAsc,
    name_desc: copy.sortNameDesc,
    status: copy.sortStatus,
    position: copy.sortPosition,
  };

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        {/* Search & Status Filters */}
        <div className="flex flex-col gap-2 border-b pb-3">
          <InputGroup size="touch">
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={copy.searchPlaceholder}
              aria-label={copy.searchAriaLabel}
            />
          </InputGroup>

          {/* Status filter chips */}
          <div
            className="no-scrollbar flex touch-pan-x gap-1.5 overflow-x-auto overscroll-x-contain pb-1"
            role="group"
            aria-label="Lọc nhân viên"
          >
            {filterChips.map((chip) => {
              const active = chip.value === statusFilter;
              return (
                <Button
                  key={chip.value}
                  type="button"
                  variant={active ? "secondary" : "outline"}
                  size="touch"
                  className="shrink-0 gap-2 px-3"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(chip.value)}
                >
                  <Badge variant={active ? "default" : chip.variant}>
                    {formatCount(chip.count)}
                  </Badge>
                  <span className="whitespace-nowrap">{chip.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Secondary Controls: Shift Filter, Position Filter, Sort By, Group Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Shift Filter Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant={shiftFilter !== "all" ? "secondary" : "outline"}
                      size="touch"
                      className="gap-1.5 px-3 text-xs"
                    >
                      <Filter className="size-3.5" />
                      <span>
                        {shiftFilter === "all"
                          ? copy.filterShiftAll
                          : shiftFilter === "none"
                            ? copy.filterShiftNone
                            : shiftFilter}
                      </span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>{copy.filterShiftAll}</DropdownMenuLabel>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setShiftFilter("all")}
                  >
                    {copy.filterShiftAll}
                  </DropdownMenuItem>
                  {uniqueShiftNames.map((name) => (
                    <DropdownMenuItem
                      key={name}
                      size="touch"
                      onClick={() => setShiftFilter(name)}
                    >
                      {name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setShiftFilter("none")}
                  >
                    {copy.filterShiftNone}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Position Filter Dropdown */}
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
                        <span>
                          {positionFilter === "all"
                            ? copy.filterPositionAll
                            : positionFilter}
                        </span>
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>{copy.filterPositionAll}</DropdownMenuLabel>
                    <DropdownMenuItem
                      size="touch"
                      onClick={() => setPositionFilter("all")}
                    >
                      {copy.filterPositionAll}
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

            <div className="flex items-center gap-1.5">
              {/* Sort Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="gap-1.5 px-3 text-xs"
                    >
                      <ArrowUpDown className="size-3.5" />
                      <span>{sortLabelMap[sortBy]}</span>
                    </Button>
                  }
                />
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>{copy.sortBy}</DropdownMenuLabel>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setSortBy("shift")}
                  >
                    {copy.sortShift}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setSortBy("name_asc")}
                  >
                    {copy.sortNameAsc}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setSortBy("name_desc")}
                  >
                    {copy.sortNameDesc}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setSortBy("status")}
                  >
                    {copy.sortStatus}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    size="touch"
                    onClick={() => setSortBy("position")}
                  >
                    {copy.sortPosition}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Group By Shift Toggle */}
              <Button
                type="button"
                variant={groupByShift ? "secondary" : "outline"}
                size="touch"
                className="gap-1.5 px-3 text-xs"
                onClick={() => setGroupByShift(!groupByShift)}
                title={groupByShift ? copy.flatList : copy.groupByShift}
              >
                <Layers className="size-3.5" />
                <span>{groupByShift ? copy.groupByShift : copy.flatList}</span>
              </Button>
            </div>
          </div>
        </div>

        {/* Member Grid or Grouped Member Grid */}
        {filteredMembers.length > 0 ? (
          groupedByShiftMembers ? (
            <div className="flex flex-col gap-4">
              {groupedByShiftMembers.map((group) => (
                <section
                  key={group.shiftName}
                  className="flex flex-col gap-2"
                  aria-label={group.shiftName}
                >
                  <div className="flex items-center justify-between px-1">
                    <h3 className="font-heading text-sm font-semibold text-foreground">
                      {group.shiftName}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {copy.membersCount(group.members.length)}
                    </span>
                  </div>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {group.members.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onOpenDrawer={setActiveMember}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {filteredMembers.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  onOpenDrawer={setActiveMember}
                />
              ))}
            </div>
          )
        ) : (
          <AppEmptyState
            mode={hasActiveFilter ? "no-results" : "no-data"}
            icon={<UsersRound />}
            title={
              hasActiveFilter ? "Không có nhân viên phù hợp" : "Chưa có nhân sự"
            }
            description={
              hasActiveFilter
                ? "Đổi từ khóa hoặc trạng thái để xem lại danh sách nhân viên chi nhánh."
                : "Chi nhánh này chưa có nhân sự đang hoạt động nào được phân bổ."
            }
          />
        )}
      </div>

      <AppDrawer
        open={activeMember !== null}
        onOpenChange={(open) => !open && setActiveMember(null)}
        title={activeMember?.name ?? ""}
        description={
          activeMember
            ? [activeMember.code, activeMember.positionLabel]
                .filter(Boolean)
                .join(" · ") || detailCopy.description
            : undefined
        }
        contentClassName="flex max-h-dvh-80 flex-col overflow-hidden sm:mx-auto sm:max-w-2xl"
        headerClassName="shrink-0 text-left"
        footerClassName="shrink-0 pt-2"
        footer={
          activeMember?.employeeId != null && canManageEmployeeOverrides ? (
            <Button
              type="button"
              variant="default"
              size="touch"
              className="w-full"
              onClick={() => setTasksEmployeeId(activeMember.employeeId)}
            >
              {detailCopy.openShiftTasks}
            </Button>
          ) : undefined
        }
      >
        {activeMember ? (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center">
              <MemberAvatar member={activeMember} size="lg" />
            </div>
            <MemberDetailBlock title={detailCopy.contactSection}>
              <InfoTile
                icon={<Phone />}
                label={detailCopy.phone}
                value={
                  activeMember.phone ? (
                    <a
                      href={phoneHref(activeMember.phone)}
                      className="text-primary hover:underline"
                    >
                      {activeMember.phone}
                    </a>
                  ) : (
                    detailCopy.phoneMissing
                  )
                }
              />
            </MemberDetailBlock>

            <MemberDetailBlock title={detailCopy.todaySection}>
              <div className="grid grid-cols-2 gap-2">
                <InfoTile
                  icon={<CheckCircle2 />}
                  label={detailCopy.status}
                  value={
                    activeTodayStatus ? (
                      <Badge variant={activeTodayStatus.variant}>
                        {activeTodayStatus.label}
                      </Badge>
                    ) : (
                      detailCopy.statusUnknown
                    )
                  }
                />
                <InfoTile
                  icon={<Clock3 />}
                  label={detailCopy.shift}
                  value={
                    activeMember.todayShiftName
                      ? `${activeMember.todayShiftName}${activeMember.todayShiftStartTime ? ` (${activeMember.todayShiftStartTime}–${activeMember.todayShiftEndTime})` : ""}`
                      : detailCopy.noShift
                  }
                />
                <InfoTile
                  icon={<CheckCircle2 />}
                  label={detailCopy.times}
                  value={`${formatOptionalTime(activeMember.checkIn)} - ${formatOptionalTime(activeMember.checkOut)}`}
                />
                <InfoTile
                  icon={<ClipboardList />}
                  label={detailCopy.count}
                  value={
                    activeCountStatus?.label ?? detailCopy.countNone
                  }
                />
              </div>
            </MemberDetailBlock>

            {activeMember.employeeId == null ? (
              <p className="text-sm text-muted-foreground">
                {detailCopy.noEmployeeRecord}
              </p>
            ) : null}
          </div>
        ) : null}
      </AppDrawer>

      {canManageEmployeeOverrides ? (
        <BranchEmployeeTasksSheet
          branchId={branchId}
          employeeId={tasksEmployeeId}
          open={tasksEmployeeId != null}
          onOpenChange={(open) => {
            if (!open) setTasksEmployeeId(null);
          }}
        />
      ) : null}
    </>
  );
}

