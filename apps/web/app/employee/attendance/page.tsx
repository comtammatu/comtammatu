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
import { formatDateVN, formatTimeVN } from "../_lib/vn-business-date";

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
      <EmployeePage
        title="Ngày công"
        description="Lịch sử vào ca, ra ca trong 30 ngày gần nhất."
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
  const present = attendance.filter(
    (r) => r.status === "present" || r.status === "late",
  ).length;
  const absent = attendance.filter((r) => r.status === "absent").length;
  const halfDay = attendance.filter((r) => r.status === "half_day").length;

  return (
    <EmployeePage
      title="Ngày công"
      description="Lịch sử vào ca, ra ca trong 30 ngày gần nhất."
      badge={{ children: "30 ngày", variant: "outline" }}
    >
      <EmployeePanel title="Tổng quan">
        <EmployeeDetailList
          columns={3}
          rows={[
            { label: "Có mặt", value: present },
            { label: "Vắng", value: absent },
            { label: "Nửa ngày", value: halfDay },
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
  shifts: { name: string } | null;
}
