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
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import { fetchMySchedule, type ScheduleShift } from "./actions";

const DAY_NAMES = [
  "Chủ Nhật",
  "Thứ Hai",
  "Thứ Ba",
  "Thứ Tư",
  "Thứ Năm",
  "Thứ Sáu",
  "Thứ Bảy",
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
  // getDay() returns 0 for Sunday, 1 for Monday...
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

interface ScheduleClientProps {
  initialShifts: ScheduleShift[];
  initialWeekStart: string;
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
        setError(result.error ?? "Không tải được lịch ca.");
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

  // Build shift lookup by date
  const shiftsByDate = new Map<string, ScheduleShift>();
  for (const shift of shifts) {
    shiftsByDate.set(shift.date, shift);
  }

  // Week range label
  const weekEndStr = weekDates[6];
  const weekLabel = weekEndStr
    ? `${formatDate(weekStart)} – ${formatDate(weekEndStr)}`
    : formatDate(weekStart);

  return (
    <div className="flex flex-col gap-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPrevWeek}
          disabled={isPending}
          aria-label="Tuần trước"
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
              Tuần này
            </Button>
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={goToNextWeek}
          disabled={isPending}
          aria-label="Tuần sau"
        >
          <IconChevronRight />
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <Empty className="border border-destructive/30 bg-destructive/5">
          <EmptyHeader>
            <EmptyTitle>Không tải được lịch ca</EmptyTitle>
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
              Thử lại
            </Button>
          </EmptyContent>
        </Empty>
      )}

      {/* Loading skeleton */}
      {isPending && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border p-4"
            >
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Day list */}
      {!isPending && !error && (
        <div className="flex flex-col gap-3">
          {shifts.length === 0 &&
            weekDates.every((d) => !shiftsByDate.has(d)) && (
              <Empty>
                <EmptyMedia variant="icon">
                  <IconCalendarEvent />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>Chưa có lịch ca tuần này</EmptyTitle>
                  <EmptyDescription>Liên hệ quản lý xếp ca.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}

          <ItemGroup>
            {(shifts.length > 0 || weekDates.some((d) => shiftsByDate.has(d))
              ? weekDates
              : []
            ).map((dateStr) => {
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
                      {isToday ? <Badge variant="info">Hôm nay</Badge> : null}
                    </ItemTitle>
                    <ItemDescription>{formatDate(dateStr)}</ItemDescription>
                  </ItemContent>

                  <ItemActions className="text-right">
                    {shift ? (
                      <div>
                        <p className="text-sm font-medium">
                          {shift.shift_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shift.start_time} – {shift.end_time}
                        </p>
                      </div>
                    ) : (
                      <Badge variant="outline">Nghỉ</Badge>
                    )}
                  </ItemActions>
                </Item>
              );
            })}
          </ItemGroup>
        </div>
      )}
    </div>
  );
}
