/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator hub uses vietnamese */
"use client";

import { useState, useEffect } from "react";
import { Users, Mail, Phone, CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ItemGroup } from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@comtammatu/ui/components/drawer";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { fetchEmployeeSummary } from "./actions";
import { formatVNBusinessDate as formatDateVN, formatVNTime as formatTimeVN } from "@comtammatu/shared/time";
import { AppEmptyState } from "@/components/surface";
import { useLongPress } from "@lib/hooks/use-long-press";

interface Employee {
  id: number;
  profileId: string;
  name: string;
  code: string | null;
  email: string;
  phone: string;
  startDate: string | null;
}

function EmployeeCard({
  emp,
  onOpenDrawer,
}: {
  emp: Employee;
  onOpenDrawer: (emp: Employee) => void;
}) {
  const longPress = useLongPress({
    onLongPress: () => onOpenDrawer(emp),
    onClick: () => onOpenDrawer(emp),
  });

  return (
    <InteractiveCard minHeight="mobile" className="h-auto touch-pan-y select-none cursor-pointer" {...longPress}>
      <div className="flex min-w-0 flex-1 flex-col gap-1 pointer-events-none">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium">{emp.name}</p>
          {emp.code && <Badge variant="secondary">{emp.code}</Badge>}
        </div>
        <div className="flex gap-4 text-xs text-muted-foreground">
          {emp.phone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" />
              {emp.phone}
            </span>
          )}
          {emp.startDate && (
            <span className="flex items-center gap-1">
              <CalendarDays className="size-3" />
              {formatDateVN(emp.startDate)}
            </span>
          )}
        </div>
      </div>
    </InteractiveCard>
  );
}

export function MembersClient({
  employees,
}: {
  branchId: number;
  employees: Employee[];
}) {
  const [activeEmp, setActiveEmp] = useState<Employee | null>(null);
  const [summaryData, setSummaryData] = useState<{
    leaves: {
      id: number;
      start_date: string;
      end_date: string;
      reason: string | null;
      status: string;
    }[];
    attendanceCount: number;
    attendanceRecords: {
      id: number;
      check_in: string | null;
      check_out: string | null;
      date: string;
    }[];
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (activeEmp) {
      setIsLoading(true);
      fetchEmployeeSummary(activeEmp.id).then((res) => {
        if (res.success && res.data) {
          setSummaryData(res.data);
        }
        setIsLoading(false);
      });
    } else {
      setSummaryData(null);
    }
  }, [activeEmp]);

  if (employees.length === 0) {
    return (
      <AppEmptyState
        icon={<Users />}
        title="Chưa có nhân sự"
        description="Chi nhánh này chưa có nhân sự nào được phân bổ."
      />
    );
  }

  return (
    <>
      <ItemGroup className="flex flex-col gap-2">
        {employees.map((emp) => (
          <EmployeeCard
            key={emp.id}
            emp={emp}
            onOpenDrawer={setActiveEmp}
          />
        ))}
      </ItemGroup>

      <Drawer
        open={activeEmp !== null}
        onOpenChange={(o) => !o && setActiveEmp(null)}
      >
        <DrawerContent className="flex max-h-dvh-80 flex-col overflow-hidden">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>{activeEmp?.name}</DrawerTitle>
            <DrawerDescription>
              {activeEmp?.code ? `Mã NV: ${activeEmp.code}` : "Thông tin chi tiết nhân sự"}
            </DrawerDescription>
          </DrawerHeader>
          <ScrollArea className="min-h-0 flex-1 px-4">
            <div className="flex flex-col gap-4 pb-4 pr-2" data-vaul-no-drag>
              {/* Thông tin liên hệ */}
              <div className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold">Thông tin liên hệ</h4>
                <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Phone className="size-4" />
                    {activeEmp?.phone ? (
                      <a
                        href={`tel:${activeEmp.phone.replace(/\s+/g, "")}`}
                        className="text-primary hover:underline"
                      >
                        {activeEmp.phone}
                      </a>
                    ) : (
                      <span>Chưa cập nhật</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="size-4" />
                    {activeEmp?.email ? (
                      <a
                        href={`mailto:${activeEmp.email}`}
                        className="text-primary hover:underline"
                      >
                        {activeEmp.email}
                      </a>
                    ) : (
                      <span>Chưa cập nhật</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    <span>
                      Ngày vào làm:{" "}
                      {activeEmp?.startDate ? formatDateVN(activeEmp.startDate) : "Chưa cập nhật"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ngày công */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold">Ngày công tháng này</h4>
                  {isLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Badge variant="success">{summaryData?.attendanceCount || 0} ngày</Badge>
                  )}
                </div>
                {!isLoading && summaryData && summaryData.attendanceRecords.length > 0 && (
                  <div className="flex flex-col gap-2 text-sm">
                    {summaryData.attendanceRecords.map((record) => (
                      <div key={record.id} className="flex justify-between items-center border-b last:border-0 pb-2 last:pb-0">
                        <span className="font-medium text-foreground">
                          {formatDateVN(record.date)}
                        </span>
                        <div className="flex items-center gap-1 text-muted-foreground text-xs font-mono">
                          <CheckCircle2 className="size-3 text-success" />
                          {record.check_in ? formatTimeVN(record.check_in) : "--"} -{" "}
                          {record.check_out ? formatTimeVN(record.check_out) : "--"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoading && summaryData?.attendanceRecords.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Chưa có dữ liệu chấm công tháng này.</p>
                )}
              </div>

              {/* Ngày nghỉ */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-semibold">Yêu cầu nghỉ phép tháng này</h4>
                  {isLoading ? (
                    <Spinner className="size-4" />
                  ) : (
                    <Badge variant={summaryData && summaryData.leaves.length > 0 ? "warning" : "secondary"}>
                      {summaryData?.leaves.length || 0} yêu cầu
                    </Badge>
                  )}
                </div>
                {!isLoading && summaryData && summaryData.leaves.length > 0 && (
                  <div className="flex flex-col gap-2 text-sm">
                    {summaryData.leaves.map((leave) => (
                      <div key={leave.id} className="flex flex-col gap-1 border-b last:border-0 pb-2 last:pb-0">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-foreground text-xs">
                            {formatDateVN(leave.start_date)} - {formatDateVN(leave.end_date)}
                          </span>
                          <Badge variant={leave.status === "approved" ? "success" : leave.status === "rejected" ? "destructive" : "warning"}>
                            {leave.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{leave.reason}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isLoading && summaryData?.leaves.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Không có yêu cầu nghỉ phép nào.</p>
                )}
              </div>
            </div>
          </ScrollArea>
        </DrawerContent>
      </Drawer>
    </>
  );
}
