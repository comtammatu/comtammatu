/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
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
  todayShiftName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  onApprovedLeave: boolean;
  countStatus: TeamMemberCountStatus;
}

type TeamMemberFilter = "all" | "working" | "on_leave" | "count_assigned";

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

function memberMatchesQuery(member: TeamMemberRow, query: string): boolean {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) return true;

  return matchesSearch(
    [
      member.name,
      member.code ?? "",
      member.phone ?? "",
      member.positionLabel ?? "",
    ],
    normalizedQuery,
  );
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
  return (
    <TeamMemberTile
      name={member.name}
      subtitle={member.positionLabel ?? "Chưa có chức danh"}
      secondarySubtitle={codeOrPlaceholder}
      avatar={<MemberAvatar member={member} size="lg" />}
      badges={renderMemberCardBadges(member)}
      ariaLabel={`Mở hồ sơ ${member.name}`}
      layout="grid"
      onSelect={() => onOpenDrawer(member)}
    />
  );
}

function renderMemberCardBadges(member: TeamMemberRow) {
  const status = todayStatusMeta(member.todayStatus);
  return <Badge variant={status.variant}>{status.label}</Badge>;
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
  canManageEmployeeOverrides = false,
}: {
  branchId: number;
  employees: TeamMemberRow[];
  canManageEmployeeOverrides?: boolean;
}) {
  const [activeMember, setActiveMember] = useState<TeamMemberRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TeamMemberFilter>("all");
  const [tasksEmployeeId, setTasksEmployeeId] = useState<number | null>(null);

  const stats = useMemo(
    () => ({
      total: employees.length,
      working: employees.filter((member) => member.todayStatus === "working")
        .length,
      onLeave: employees.filter((member) => member.onApprovedLeave).length,
      countAssigned: employees.filter(
        (member) => member.countStatus !== "not_assigned",
      ).length,
    }),
    [employees],
  );

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

  const filteredMembers = useMemo(
    () =>
      employees.filter(
        (member) =>
          memberMatchesQuery(member, searchQuery) &&
          matchesFilter(member, statusFilter),
      ),
    [employees, searchQuery, statusFilter],
  );
  const hasActiveFilter =
    searchQuery.trim().length > 0 || statusFilter !== "all";

  const activeTodayStatus = activeMember
    ? todayStatusMeta(activeMember.todayStatus)
    : null;
  const activeCountStatus = activeMember
    ? countStatusMeta(activeMember.countStatus)
    : null;

  return (
    <>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2 border-b pb-3">
          <InputGroup size="touch">
            <InputGroupAddon>
              <Search aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Tìm tên, mã NV, SĐT, chức danh..."
              aria-label="Tìm nhân viên"
            />
          </InputGroup>
          <div
            className="flex flex-wrap gap-1.5"
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
        </div>

        {filteredMembers.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredMembers.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                onOpenDrawer={setActiveMember}
              />
            ))}
          </div>
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
                          activeMember.todayShiftName ?? detailCopy.noShift
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
