import {
  CalendarDays,
  Clock,
  ListChecks,
  UserCircle,
} from "lucide-react";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import {
  EmployeeActionSection,
  EmployeePage,
} from "@/(protected)/employee/components/employee-page";
import { messages } from "@lib/messages";

export default async function OperatorShiftPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;
  const copy = messages.employee;

  return (
    <EmployeePage title={APP_COPY_VI.operatorShift} hideHeaderOnMobile>
      <EmployeeActionSection
        title={MODULE_ACL.employee.label}
        links={[
          {
            key: "clock",
            href: `/br/${branchId}/shift/clock`,
            icon: Clock,
            title: copy.home.clockPanelTitle,
          },
          {
            key: "tasks",
            href: `/br/${branchId}/shift/tasks`,
            icon: ListChecks,
            title: copy.home.workdayTitle,
          },
          {
            key: "schedule",
            href: `/br/${branchId}/shift/schedule`,
            icon: CalendarDays,
            title: copy.nav.schedule,
          },
          {
            key: "profile",
            href: `/br/${branchId}/shift/profile`,
            icon: UserCircle,
            title: copy.nav.profileShort,
          },
        ]}
      />
    </EmployeePage>
  );
}
