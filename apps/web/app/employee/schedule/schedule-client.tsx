"use client";

import { useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyContent,
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
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { CalendarDays as IconCalendarEvent, ChevronLeft as IconChevronLeft, ChevronRight as IconChevronRight, RefreshCw as IconRefresh } from "lucide-react";
import { AppBoneyardSkeleton } from "../../_components/boneyard-skeleton";
import { fetchMySchedule, type ScheduleShift } from "./actions";

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
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return DAY_NAMES[d.getDay()] ?? "";
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function generateWeekDates(mondayStr: string): string[] {
  const monday = new Date(mondayStr + "T00:00:00");
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    dates.push(toDateStr(d));
  }
  return dates;
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
    <div className="flex flex-col gap-3">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border p-4">
          <Skeleton className="size-10 rounded-lg" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      ))}
    </div>
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
                      {shift.start_time} {"\u2013"} {shift.end_time}
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

  const todayStr = toDateStr(new Date());
  const currentMonday = toDateStr(getMonday(new Date()));
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
    const monday = new Date(weekStart + "T00:00:00");
    monday.setDate(monday.getDate() - 7);
    loadWeek(toDateStr(monday));
  }

  function goToNextWeek() {
    const monday = new Date(weekStart + "T00:00:00");
    monday.setDate(monday.getDate() + 7);
    loadWeek(toDateStr(monday));
  }

  function goToCurrentWeek() {
    loadWeek(currentMonday);
  }

  const weekEndStr = weekDates[6];
  const weekLabel = weekEndStr
    ? `${formatDate(weekStart)} \u2013 ${formatDate(weekEndStr)}`
    : formatDate(weekStart);

  return (
    <div className="flex flex-col gap-4">
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

        <div className="flex flex-1 flex-col items-center gap-1">
          <p className="text-sm font-medium">{weekLabel}</p>
          {!isCurrentWeek && (
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={goToCurrentWeek}
              disabled={isPending}
            >
              {TEXT.currentWeek}
            </Button>
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

      {error && (
        <Empty className="border border-destructive/30 bg-destructive/5">
          <EmptyHeader>
            <EmptyTitle>{TEXT.loadError}</EmptyTitle>
            <EmptyDescription>{error}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadWeek(weekStart)}
              disabled={isPending}
            >
              <IconRefresh data-icon="inline-start" />
              {TEXT.retry}
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {!error && (
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
      )}
    </div>
  );
}
