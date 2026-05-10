"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  BRANCH_VI,
  ERRORS_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import {
  fetchAttendance,
  fetchAttendanceSummary,
  updateAttendanceStatus,
} from "./actions";
import type { BranchOption } from "./page";

interface AttendanceRecord {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  note: string | null;
  employee_id: number;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
  shifts: { name: string; start_time: string; end_time: string } | null;
}

interface AttendanceSummaryRow {
  employee_id: number;
  employee_code: string;
  full_name: string;
  present: number;
  late: number;
  absent: number;
  half_day: number;
  total: number;
}

const STATUS_LABELS: Record<string, string> = {
  present: "Có mặt",
  late: "Đi trễ",
  absent: "Vắng",
  half_day: "Nửa ngày",
};

const STATUS_COLORS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  present: "default",
  late: "outline",
  absent: "destructive",
  half_day: "secondary",
};

interface AttendanceTableProps {
  branches: BranchOption[];
}

export function AttendanceTable({ branches }: AttendanceTableProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState<AttendanceSummaryRow[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<number>(
    branches[0]?.id ?? 0,
  );
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [view, setView] = useState<"detail" | "summary">("summary");
  const [isPending, startTransition] = useTransition();

  function loadData(branchId: number, month: string) {
    setSelectedBranch(branchId);
    setSelectedMonth(month);
    startTransition(async () => {
      if (view === "summary") {
        const result = await fetchAttendanceSummary({ branchId, month });
        if (result.success) {
          setSummary((result.data ?? []) as AttendanceSummaryRow[]);
        } else {
          toast.error(result.error ?? ERRORS_VI.fallback);
        }
      } else {
        const result = await fetchAttendance({ branchId, month });
        if (result.success) {
          setRecords((result.data ?? []) as AttendanceRecord[]);
        } else {
          toast.error(result.error ?? ERRORS_VI.fallback);
        }
      }
    });
  }

  function handleStatusChange(attendanceId: number, newStatus: string) {
    startTransition(async () => {
      const result = await updateAttendanceStatus({
        attendanceId,
        status: newStatus as "present" | "absent" | "late" | "half_day",
      });
      if (result.success) {
        setRecords((prev) =>
          prev.map((r) =>
            r.id === attendanceId ? { ...r, status: newStatus } : r,
          ),
        );
        toast.success("Đã cập nhật trạng thái");
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  // Generate month options (last 6 months)
  const monthOptions: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    monthOptions.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={selectedBranch.toString()}
          onValueChange={(v) => loadData(Number(v), selectedMonth)}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder={BRANCH_VI.select} />
          </SelectTrigger>
          <SelectContent>
            {branches.map((b) => (
              <SelectItem key={b.id} value={b.id.toString()}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={selectedMonth}
          onValueChange={(v) => loadData(selectedBranch, v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            variant={view === "summary" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("summary");
              loadData(selectedBranch, selectedMonth);
            }}
          >
            Tổng hợp
          </Button>
          <Button
            variant={view === "detail" ? "default" : "ghost"}
            size="sm"
            onClick={() => {
              setView("detail");
              loadData(selectedBranch, selectedMonth);
            }}
          >
            Chi tiết
          </Button>
        </div>

        {isPending && <Spinner />}
      </div>

      {view === "summary" ? (
        <SummaryView data={summary} />
      ) : (
        <DetailView
          data={records}
          onStatusChange={handleStatusChange}
          isPending={isPending}
        />
      )}
    </div>
  );
}

function SummaryView({ data }: { data: AttendanceSummaryRow[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chọn chi nhánh và tháng, sau đó nhấn tải dữ liệu.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Mã NV</TableHead>
            <TableHead>Họ tên</TableHead>
            <TableHead className="text-center">Có mặt</TableHead>
            <TableHead className="text-center">Đi trễ</TableHead>
            <TableHead className="text-center">Vắng</TableHead>
            <TableHead className="text-center">Nửa ngày</TableHead>
            <TableHead className="text-center">{FORM_VI.total}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.employee_id}>
              <TableCell className="font-mono">{row.employee_code}</TableCell>
              <TableCell>{row.full_name}</TableCell>
              <TableCell className="text-center font-medium text-success">
                {row.present}
              </TableCell>
              <TableCell className="text-center font-medium text-warning-foreground">
                {row.late}
              </TableCell>
              <TableCell className="text-center font-medium text-destructive">
                {row.absent}
              </TableCell>
              <TableCell className="text-center font-medium text-info">
                {row.half_day}
              </TableCell>
              <TableCell className="text-center font-bold">
                {row.total}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailView({
  data,
  onStatusChange,
  isPending,
}: {
  data: AttendanceRecord[];
  onStatusChange: (id: number, status: string) => void;
  isPending: boolean;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Chưa có dữ liệu chấm công.
      </p>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{FORM_VI.date}</TableHead>
            <TableHead>{STAFF_VI.long}</TableHead>
            <TableHead>Ca</TableHead>
            <TableHead>Vào</TableHead>
            <TableHead>Ra</TableHead>
            <TableHead>{FORM_VI.status}</TableHead>
            <TableHead>{FORM_VI.notes}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-mono text-sm">{record.date}</TableCell>
              <TableCell>
                {record.employees?.profiles?.full_name ?? "—"}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {record.shifts?.name ?? "—"}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {record.check_in
                  ? new Date(record.check_in).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </TableCell>
              <TableCell className="font-mono text-sm">
                {record.check_out
                  ? new Date(record.check_out).toLocaleTimeString("vi-VN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </TableCell>
              <TableCell>
                <Select
                  value={record.status}
                  onValueChange={(v) => onStatusChange(record.id, v)}
                  disabled={isPending}
                >
                  <SelectTrigger size="xs" className="w-28">
                    <Badge
                      variant={STATUS_COLORS[record.status] ?? "secondary"}
                    >
                      {STATUS_LABELS[record.status] ?? record.status}
                    </Badge>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Có mặt</SelectItem>
                    <SelectItem value="late">Đi trễ</SelectItem>
                    <SelectItem value="absent">Vắng</SelectItem>
                    <SelectItem value="half_day">Nửa ngày</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="max-w-32 truncate text-sm text-muted-foreground">
                {record.note ?? ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
