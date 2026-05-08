import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  EmployeeDetailList,
  EmployeePage,
  EmployeePanel,
} from "../components/employee-page";
import { getEmployeeContext } from "../_lib/employee-context";
import { formatDateVN, formatTimeVN, getTodayVN } from "../_lib/vn-business-date";
import { MonthPicker } from "./month-picker";

const STATUS_LABELS: Record<string, string> = {
  present: "Có mặt",
  late: "Đi trễ",
  absent: "Vắng",
  half_day: "Nửa ngày",
};

const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  present: "success",
  late: "warning",
  absent: "destructive",
  half_day: "info",
};

export default async function EmployeeAttendancePage(props: {
  searchParams: Promise<{ month?: string }>;
}) {
  const ctx = await getEmployeeContext();
  const { month: monthParam } = await props.searchParams;
  const todayVN = getTodayVN();
  const currentMonth = todayVN.slice(0, 7);
  const month = isValidMonth(monthParam) ? monthParam : currentMonth;
  const monthLabel = formatMonthLabel(month);

  if (!ctx) {
    return (
      <EmployeePage
        title="Ngày công"
        description="Lịch sử vào ca, ra ca theo tháng."
      >
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Không tìm thấy hồ sơ nhân viên</EmptyTitle>
            <EmptyDescription>
              Không thể truy xuất hồ sơ nhân viên từ tài khoản này. Vui lòng
              liên hệ quản trị viên.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </EmployeePage>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  const monthStart = `${month}-01`;
  const monthEnd = nextMonthStart(month);

  const { data: records } = await supabase
    .from("attendance_records")
    .select(
      "id, date, check_in, check_out, status, note, shifts ( name, start_time, end_time )",
    )
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", monthStart)
    .lt("date", monthEnd)
    .order("date", { ascending: false });

  const attendance = (records ?? []) as unknown as AttendanceRow[];
  const present = attendance.filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  const absent = attendance.filter((r) => r.status === "absent").length;
  const halfDay = attendance.filter((r) => r.status === "half_day").length;

  const computed = attendance.map((r) => computeRowMetrics(r));
  const totalWorkedMin = computed.reduce((s, c) => s + c.workedMin, 0);
  const totalOtMin = computed.reduce((s, c) => s + c.otMin, 0);
  const totalLateMin = computed.reduce((s, c) => s + c.lateMin, 0);

  return (
    <EmployeePage
      title="Ngày công"
      description="Lịch sử vào ca, ra ca theo tháng."
      badge={{ children: monthLabel, variant: "outline" }}
    >
      <MonthPicker selectedMonth={month} currentMonth={currentMonth} />
      <EmployeePanel title="Tổng quan">
        <EmployeeDetailList
          columns={3}
          rows={[
            { label: "Có mặt", value: present },
            { label: "Vắng", value: absent },
            { label: "Nửa ngày", value: halfDay },
          ]}
        />
        <EmployeeDetailList
          columns={3}
          rows={[
            {
              label: "Tổng giờ làm",
              value: formatHours(totalWorkedMin),
              muted: totalWorkedMin === 0,
            },
            {
              label: "Tăng ca (OT)",
              value: formatHours(totalOtMin),
              muted: totalOtMin === 0,
            },
            {
              label: "Đi trễ",
              value: formatMinutes(totalLateMin),
              muted: totalLateMin === 0,
            },
          ]}
        />
      </EmployeePanel>

      <EmployeePanel
        title="Lịch sử chấm công"
        description="Mỗi dòng là một ngày công đã ghi nhận."
      >
        {attendance.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Chưa có dữ liệu chấm công</EmptyTitle>
              <EmptyDescription>
                Các lần vào ca, ra ca sẽ hiển thị tại đây.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ItemGroup className="md:hidden">
              {attendance.map((record) => (
                <Item key={record.id} variant="outline" className="items-start">
                  <ItemContent>
                    <ItemTitle>{formatDateVN(record.date)}</ItemTitle>
                    <ItemDescription>
                      {record.shifts?.name ?? "Không có ca"}
                    </ItemDescription>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Vào ca</p>
                        <p className="font-mono text-foreground">
                          {record.check_in
                            ? formatTimeVN(record.check_in)
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ra ca</p>
                        <p className="font-mono text-foreground">
                          {record.check_out
                            ? formatTimeVN(record.check_out)
                            : "—"}
                        </p>
                      </div>
                    </div>
                    {record.note ? (
                      <ItemDescription>{record.note}</ItemDescription>
                    ) : null}
                  </ItemContent>
                  <ItemActions>
                    <Badge
                      variant={STATUS_VARIANTS[record.status] ?? "secondary"}
                    >
                      {STATUS_LABELS[record.status] ?? record.status}
                    </Badge>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>

            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{FORM_VI.date}</TableHead>
                    <TableHead>Ca</TableHead>
                    <TableHead>Vào</TableHead>
                    <TableHead>Ra</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attendance.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-sm">
                        {formatDateVN(record.date)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {record.shifts?.name ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {record.check_in ? formatTimeVN(record.check_in) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {record.check_out
                          ? formatTimeVN(record.check_out)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            STATUS_VARIANTS[record.status] ?? "secondary"
                          }
                        >
                          {STATUS_LABELS[record.status] ?? record.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </EmployeePanel>
    </EmployeePage>
  );
}

interface AttendanceRow {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  note: string | null;
  shifts: {
    name: string;
    start_time: string;
    end_time: string;
  } | null;
}

interface RowMetrics {
  workedMin: number;
  otMin: number;
  lateMin: number;
}

function computeRowMetrics(r: AttendanceRow): RowMetrics {
  if (!r.check_in || !r.check_out) {
    return { workedMin: 0, otMin: 0, lateMin: 0 };
  }
  const workedMin = Math.max(
    0,
    Math.round(
      (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) /
        60_000,
    ),
  );
  let otMin = 0;
  let lateMin = 0;
  if (r.shifts) {
    const scheduled = parseTimeMin(r.shifts.end_time) - parseTimeMin(r.shifts.start_time);
    const scheduledMin = scheduled < 0 ? scheduled + 24 * 60 : scheduled;
    otMin = Math.max(0, workedMin - scheduledMin);
    const checkInVN = new Date(r.check_in).toLocaleTimeString("vi-VN", {
      hour12: false,
      timeZone: "Asia/Ho_Chi_Minh",
      hour: "2-digit",
      minute: "2-digit",
    });
    lateMin = Math.max(
      0,
      parseTimeMin(checkInVN) - parseTimeMin(r.shifts.start_time),
    );
  }
  return { workedMin, otMin, lateMin };
}

function parseTimeMin(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

function formatHours(min: number): string {
  if (min === 0) return "0h";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}

function formatMinutes(min: number): string {
  if (min === 0) return "0 phút";
  if (min < 60) return `${min} phút`;
  return formatHours(min);
}

function isValidMonth(s: string | undefined): s is string {
  return typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

function nextMonthStart(month: string): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m, 1));
  return date.toISOString().slice(0, 10);
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `Tháng ${m}/${y}`;
}
