"use client";

import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import {
  CalendarDays as IconCalendarEvent,
  ChevronLeft as IconChevronLeft,
  ChevronRight as IconChevronRight,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import { EmployeePanel } from "../components/employee-page";
import { fetchMySchedule, type ScheduleShift } from "./actions";
import {
  addVNDateDays,
  formatVNBusinessDate,
  getVNDateString,
  getVNWeekStartDateString,
  parseISODateParts,
} from "@comtammatu/shared/time";

const TEXT = {
  currentWeek: "Tu\u1ea7n n\u00e0y",
  emptyDescription: "Li\u00ean h\u1ec7 qu\u1ea3n l\u00fd x\u1ebfp ca.",
  emptyTitle: "Ch\u01b0a c\u00f3 l\u1ecbch ca tu\u1ea7n n\u00e0y",
  loadError: "Kh\u00f4ng t\u1ea3i \u0111\u01b0\u1ee3c l\u1ecbch ca.",
  nextWeek: "Tu\u1ea7n sau",
  prevWeek: "Tu\u1ea7n tr\u01b0\u1edbc",
  rest: "Ngh\u1ec9",
  retry: "Th\u1eed l\u1ea1i",
  today: "H\u00f4m nay",
} as const;

const DAY_NAMES = [
  "Ch\u1ee7 Nh\u1eadt",
  "Th\u1ee9 Hai",
  "Th\u1ee9 Ba",
  "Th\u1ee9 T\u01b0",
  "Th\u1ee9 N\u0103m",
  "Th\u1ee9 S\u00e1u",
  "Th\u1ee9 B\u1ea3y",
] as const;

function formatDate(dateStr: string): string {
  return formatVNBusinessDate(dateStr);
}

function getDayName(dateStr: string): string {
  const parts = parseISODateParts(dateStr);
  if (!parts) return "";
  const day = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, 5, 0, 0),
  ).getUTCDay();
  return DAY_NAMES[day] ?? "";
}

function generateWeekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    addVNDateDays(mondayStr, index),
  );
}

const SCHEDULE_SKELETON_FIXTURE_DATES = generateWeekDates("2026-01-05");
const SCHEDULE_SKELETON_TODAY = "2026-01-06";
const SCHEDULE_SKELETON_FIXTURE_SHIFTS: ScheduleShift[] = [
  {
    date: "2026-01-05",
    shift_name: "Ca s\u00e1ng",
    start_time: "07:00",
    end_time: "14:00",
  },
  {
    date: "2026-01-06",
    shift_name: "Ca chi\u1ec1u",
    start_time: "14:00",
    end_time: "22:00",
  },
  {
    date: "2026-01-08",
    shift_name: "Ca s\u00e1ng",
    start_time: "07:00",
    end_time: "14:00",
  },
  {
    date: "2026-01-10",
    shift_name: "Ca t\u1ed1i",
    start_time: "16:00",
    end_time: "23:00",
  },
];

interface ScheduleClientProps {
  initialShifts: ScheduleShift[];
  initialWeekStart: string;
}

function ScheduleSkeletonFallback() {
  return (
    <ItemGroup>
      {Array.from({ length: 7 }).map((_, i) => (
        <Item key={i} variant="outline">
          <ItemMedia>
            <Skeleton className="size-8 rounded-md" />
          </ItemMedia>
          <ItemContent>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
  );
}

function ScheduleWeekList({
  shifts,
  todayStr,
  weekDates,
}: {
  shifts: ScheduleShift[];
  todayStr: string;
  weekDates: string[];
}) {
  const shiftsByDate = new Map<string, ScheduleShift>();
  for (const shift of shifts) {
    shiftsByDate.set(shift.date, shift);
  }

  const hasSchedule =
    shifts.length > 0 || weekDates.some((d) => shiftsByDate.has(d));

  return (
    <div className="flex flex-col gap-3">
      {!hasSchedule && (
        <Empty>
          <EmptyMedia variant="icon">
            <IconCalendarEvent />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{TEXT.emptyTitle}</EmptyTitle>
            <EmptyDescription>{TEXT.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <ItemGroup>
        {(hasSchedule ? weekDates : []).map((dateStr) => {
          const shift = shiftsByDate.get(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <Item
              key={dateStr}
              variant="outline"
              className={cn(
                "items-center",
                isToday && "border-primary/50 bg-primary/5",
              )}
            >
              <ItemContent>
                <ItemTitle className={cn(isToday && "text-primary")}>
                  {getDayName(dateStr)}
                  {isToday ? <Badge variant="info">{TEXT.today}</Badge> : null}
                </ItemTitle>
                <ItemDescription>{formatDate(dateStr)}</ItemDescription>
              </ItemContent>

              <ItemActions className="text-right">
                {shift ? (
                  <div>
                    <p className="text-sm font-medium">{shift.shift_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {shift.start_time.slice(0, 5)} {"\u2013"}{" "}
                      {shift.end_time.slice(0, 5)}
                    </p>
                  </div>
                ) : (
                  <Badge variant="outline">{TEXT.rest}</Badge>
                )}
              </ItemActions>
            </Item>
          );
        })}
      </ItemGroup>
    </div>
  );
}

export function ScheduleClient({
  initialShifts,
  initialWeekStart,
}: ScheduleClientProps) {
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [shifts, setShifts] = useState<ScheduleShift[]>(initialShifts);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const todayStr = getVNDateString();
  const currentMonday = getVNWeekStartDateString();
  const isCurrentWeek = weekStart === currentMonday;
  const weekDates = generateWeekDates(weekStart);

  function loadWeek(newWeekStart: string) {
    setWeekStart(newWeekStart);
    setError(null);
    startTransition(async () => {
      const result = await fetchMySchedule(newWeekStart);
      if (result.success) {
        setShifts(result.data ?? []);
      } else {
        setError(result.error ?? TEXT.loadError);
        setShifts([]);
      }
    });
  }

  function goToPrevWeek() {
    loadWeek(addVNDateDays(weekStart, -7));
  }

  function goToNextWeek() {
    loadWeek(addVNDateDays(weekStart, 7));
  }

  function goToCurrentWeek() {
    loadWeek(currentMonday);
  }

  const weekEndStr = weekDates[6];
  const weekLabel = weekEndStr
    ? `${formatDate(weekStart)} \u2013 ${formatDate(weekEndStr)}`
    : formatDate(weekStart);

  return (
    <>
      <EmployeePanel title="Tuần đang xem">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={goToPrevWeek}
            disabled={isPending}
            aria-label={TEXT.prevWeek}
          >
            <IconChevronLeft />
          </Button>

          <div className="flex flex-1 flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium">{weekLabel}</p>
            {!isCurrentWeek ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={goToCurrentWeek}
                disabled={isPending}
              >
                {TEXT.currentWeek}
              </Button>
            ) : (
              <Badge variant="info">{TEXT.currentWeek}</Badge>
            )}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={goToNextWeek}
            disabled={isPending}
            aria-label={TEXT.nextWeek}
          >
            <IconChevronRight />
          </Button>
        </div>
      </EmployeePanel>

      {error && (
        <EmployeePanel
          title={TEXT.loadError}
          description={error}
          tone="destructive"
        >
          <div className="flex">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadWeek(weekStart)}
              disabled={isPending}
            >
              <IconRefresh data-icon="inline-start" />
              {TEXT.retry}
            </Button>
          </div>
        </EmployeePanel>
      )}

      {!error && (
        <EmployeePanel title="Lịch trong tuần">
          <AppBoneyardSkeleton
            name="employee-schedule-week"
            loading={isPending}
            fixture={
              <ScheduleWeekList
                shifts={SCHEDULE_SKELETON_FIXTURE_SHIFTS}
                todayStr={SCHEDULE_SKELETON_TODAY}
                weekDates={SCHEDULE_SKELETON_FIXTURE_DATES}
              />
            }
            fallback={<ScheduleSkeletonFallback />}
            snapshotConfig={{ excludeSelectors: ["svg"] }}
          >
            <ScheduleWeekList
              shifts={shifts}
              todayStr={todayStr}
              weekDates={weekDates}
            />
          </AppBoneyardSkeleton>
        </EmployeePanel>
      )}
    </>
  );
}
