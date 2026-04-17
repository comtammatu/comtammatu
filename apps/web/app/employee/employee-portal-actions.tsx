"use client";

import { useState } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { checkIn, checkOut } from "../hr/actions";
import {
  Card,
  CardContent,
} from "@comtammatu/ui/components/card";

interface TodayAttendance {
  id: number;
  checkIn: string | null;
  checkOut: string | null;
}

interface Props {
  employeeId: number;
  branchId: number;
  today: string;
  todayAttendance: TodayAttendance | null;
}

export function EmployeePortalActions({
  employeeId,
  branchId,
  today,
  todayAttendance,
}: Props) {
  const [attendance, setAttendance] = useState<TodayAttendance | null>(
    todayAttendance,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCheckedIn = !!attendance?.checkIn;
  const hasCheckedOut = !!attendance?.checkOut;

  async function handleCheckIn() {
    setLoading(true);
    setError(null);
    const result = await checkIn({
      branchId,
      employeeId,
      date: today,
    });
    setLoading(false);
    if (result.success) {
      const record = result.data as { id: number } | undefined;
      setAttendance({
        id: record?.id ?? 0,
        checkIn: new Date().toISOString(),
        checkOut: null,
      });
    } else {
      setError(result.error ?? "Không thể chấm công vào");
    }
  }

  async function handleCheckOut() {
    if (!attendance?.id) return;
    setLoading(true);
    setError(null);
    const result = await checkOut({ attendanceId: attendance.id });
    setLoading(false);
    if (result.success) {
      setAttendance((prev) =>
        prev ? { ...prev, checkOut: new Date().toISOString() } : prev,
      );
    } else {
      setError(result.error ?? "Không thể chấm công ra");
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="mb-3 flex gap-4 text-xs text-muted-foreground">
          <span>
            Vào:{" "}
            <span className="font-medium text-foreground">
              {attendance?.checkIn
                ? new Date(attendance.checkIn).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </span>
          <span>
            Ra:{" "}
            <span className="font-medium text-foreground">
              {attendance?.checkOut
                ? new Date(attendance.checkOut).toLocaleTimeString("vi-VN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </span>
          </span>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => void handleCheckIn()}
            disabled={loading || hasCheckedIn}
            className="flex-1"
            variant={hasCheckedIn ? "outline" : "default"}
          >
            {loading && !hasCheckedIn ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogIn className="mr-2 size-4" />
            )}
            {hasCheckedIn ? "Đã vào ca" : "Chấm công vào"}
          </Button>

          <Button
            onClick={() => void handleCheckOut()}
            disabled={loading || !hasCheckedIn || hasCheckedOut}
            className="flex-1"
            variant={hasCheckedOut ? "outline" : "secondary"}
          >
            {loading && hasCheckedIn && !hasCheckedOut ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 size-4" />
            )}
            {hasCheckedOut ? "Đã ra ca" : "Chấm công ra"}
          </Button>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
