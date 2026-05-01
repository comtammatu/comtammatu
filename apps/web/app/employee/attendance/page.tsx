import { getEmployeeContext } from "../_lib/employee-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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

export default async function EmployeeAttendancePage() {
  const ctx = await getEmployeeContext();

  if (!ctx) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Không tìm thấy hồ sơ nhân viên</EmptyTitle>
          <EmptyDescription>
            Không thể truy xuất hồ sơ nhân viên từ tài khoản này. Vui lòng liên
            hệ quản trị viên.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const { supabase, claims, employeeId } = ctx;

  // Get last 30 days attendance
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: records } = await supabase
    .from("attendance_records")
    .select("id, date, check_in, check_out, status, note, shifts ( name )")
    .eq("employee_id", employeeId)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", thirtyDaysAgo)
    .order("date", { ascending: false });

  const attendance = (records ?? []) as unknown as AttendanceRow[];
  // Summary
  const present = attendance.filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  const absent = attendance.filter((r) => r.status === "absent").length;
  const halfDay = attendance.filter((r) => r.status === "half_day").length;

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Lịch sử chấm công</CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-success">{present}</p>
            <p className="text-xs text-muted-foreground">Có mặt</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{absent}</p>
            <p className="text-xs text-muted-foreground">Vắng</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-info">{halfDay}</p>
            <p className="text-xs text-muted-foreground">Nửa ngày</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="overflow-hidden p-0">
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
              <ItemGroup className="p-4 md:hidden">
                {attendance.map((r) => (
                  <Item key={r.id} variant="outline" className="items-start">
                    <ItemContent>
                      <ItemTitle className="font-mono">{r.date}</ItemTitle>
                      <ItemDescription>
                        {r.shifts?.name ?? "Không có ca"}
                      </ItemDescription>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Vào ca
                          </p>
                          <p className="font-mono text-foreground">
                            {r.check_in
                              ? new Date(r.check_in).toLocaleTimeString(
                                  "vi-VN",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Ra ca</p>
                          <p className="font-mono text-foreground">
                            {r.check_out
                              ? new Date(r.check_out).toLocaleTimeString(
                                  "vi-VN",
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )
                              : "—"}
                          </p>
                        </div>
                      </div>
                    </ItemContent>
                    <ItemActions>
                      <Badge variant={STATUS_VARIANTS[r.status] ?? "secondary"}>
                        {STATUS_LABELS[r.status] ?? r.status}
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
                      <TableHead>TT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">
                          {r.date}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.shifts?.name ?? "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.check_in
                            ? new Date(r.check_in).toLocaleTimeString("vi-VN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {r.check_out
                            ? new Date(r.check_out).toLocaleTimeString(
                                "vi-VN",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={STATUS_VARIANTS[r.status] ?? "secondary"}
                          >
                            {STATUS_LABELS[r.status] ?? r.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface AttendanceRow {
  id: number;
  date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  note: string | null;
  shifts: { name: string } | null;
}