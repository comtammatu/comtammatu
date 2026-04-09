import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";

const STATUS_LABELS: Record<string, string> = {
  present: "Có mặt",
  late: "Đi trễ",
  absent: "Vắng",
  half_day: "Nửa ngày",
};

const STATUS_VARIANTS: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  present: "default",
  late: "outline",
  absent: "destructive",
  half_day: "secondary",
};

export default async function EmployeeAttendancePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  // Find employee
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Không tìm thấy hồ sơ nhân viên. Liên hệ quản lý.
      </div>
    );
  }

  // Get last 30 days attendance
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const { data: records } = await supabase
    .from("attendance_records")
    .select("id, date, check_in, check_out, status, note, shifts ( name )")
    .eq("employee_id", employee.id)
    .eq("tenant_id", claims.tenant_id)
    .gte("date", thirtyDaysAgo)
    .order("date", { ascending: false });

  const attendance = (records ?? []) as AttendanceRow[];

  // Summary
  const present = attendance.filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  const absent = attendance.filter((r) => r.status === "absent").length;
  const halfDay = attendance.filter((r) => r.status === "half_day").length;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chấm công</h1>
        <p className="mt-1 text-sm text-muted-foreground">30 ngày gần nhất</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{present}</p>
          <p className="text-xs text-muted-foreground">Có mặt</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{absent}</p>
          <p className="text-xs text-muted-foreground">Vắng</p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{halfDay}</p>
          <p className="text-xs text-muted-foreground">Nửa ngày</p>
        </div>
      </div>

      {/* Detail */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead>Ca</TableHead>
              <TableHead>Vào</TableHead>
              <TableHead>Ra</TableHead>
              <TableHead>TT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {attendance.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  Chưa có dữ liệu chấm công.
                </TableCell>
              </TableRow>
            )}
            {attendance.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-sm">{r.date}</TableCell>
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
                    ? new Date(r.check_out).toLocaleTimeString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANTS[r.status] ?? "secondary"}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
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
