import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
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
  if (!claims) redirect(buildLoginBlockedStatePath());

  // Find employee
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("profile_id", session.user.id)
    .eq("tenant_id", claims.tenant_id)
    .maybeSingle();

  if (!employee) {
    return (
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-2xl">Không tìm thấy hồ sơ nhân viên</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Không thể truy xuất hồ sơ nhân viên từ tài khoản này. Vui lòng liên
            hệ quản trị viên.
          </p>
        </CardContent>
      </Card>
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
    <div className="mx-auto max-w-lg space-y-5">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-2xl">Chấm công</CardTitle>
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
          <div className="py-8 text-center text-muted-foreground">
            Chưa có dữ liệu chấm công.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:hidden">
              {attendance.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-border/70 bg-white/82 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {r.date}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {r.shifts?.name ?? "Không có ca"}
                      </p>
                    </div>
                    <Badge variant={
                      STATUS_VARIANTS[r.status] ?? "secondary"
                    }
                    >
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Vào ca
                      </p>
                      <p className="mt-1 font-mono text-foreground">
                        {r.check_in
                          ? new Date(r.check_in).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Ra ca
                      </p>
                      <p className="mt-1 font-mono text-foreground">
                        {r.check_out
                          ? new Date(r.check_out).toLocaleTimeString("vi-VN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden md:block">
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
