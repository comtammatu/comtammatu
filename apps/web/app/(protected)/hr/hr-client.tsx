"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { fetchShifts } from "./actions";
import { EmployeeTable } from "./employee-table";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { ShiftsTable } from "./shifts-table";
import { AttendanceTable } from "./attendance-table";
import { LeaveRequestsTable } from "./leave-requests-table";
import { PositionTasksClient } from "./position-tasks-client";
import type { PositionTasksData } from "./position-tasks-actions";
import type { BranchOption, EmployeeRow, ShiftRow } from "./_types";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader, AppSection } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import {
  ShieldCheck as IconShieldCheck,
  UserPlus as IconUserPlus,
  WalletCards as IconWalletCards,
} from "lucide-react";

import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";

const workspaceCopy = messages.hr.workspace;
const copy = messages.hr.client;

interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  isBranchManager: boolean;
  canManageEmployees: boolean;
  canViewEmployees: boolean;
  canManagePositionTasks: boolean;
  positionTasksData: PositionTasksData;
}

export function HrClient({
  employees,
  branches,
  isBranchManager,
  canManageEmployees,
  canViewEmployees,
  canManagePositionTasks,
  positionTasksData,
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultTab =
    canManageEmployees && canViewEmployees ? "employees" : "attendance";
  const activeEmployees = canManageEmployees
    ? employees.filter((employee) => employee.is_active)
    : [];
  const payrollReadyCount = activeEmployees.filter(
    (employee) => Number(employee.base_salary ?? 0) > 0,
  ).length;
  const insuredEmployees = activeEmployees.filter(
    (employee) => Number(employee.insurance_base_salary ?? 0) > 0,
  ).length;
  const activeContractCount = activeEmployees.filter((employee) =>
    (employee.employment_contracts ?? []).some(
      (contract) => contract.status === "active",
    ),
  ).length;
  const missingContractCount = Math.max(
    0,
    activeEmployees.length - activeContractCount,
  );

  // Owner/unassigned are not creatable here.
  const positionOptions = positionTasksData.positions.flatMap((position) => {
    const bucket = staffRoleFromPositionCode(position.code);
    if (
      bucket === "unassigned" ||
      bucket === "owner" ||
      position.code === "waiter"
    ) {
      return [];
    }
    return [{ value: position.code, label: position.label }];
  });

  // Shifts back the setup tab; UrlTabs owns tab state so the lazy fetch is
  // tied to mount rather than tab activation.
  useEffect(() => {
    if (!canManageEmployees || shiftsLoaded) return;
    startTransition(async () => {
      const result = await fetchShifts();
      if (result.success) {
        setShifts((result.data as ShiftRow[]) ?? []);
        setShiftsLoaded(true);
      } else {
        toast.error(result.error ?? copy.shiftsLoadFailed);
      }
    });
  }, [canManageEmployees, shiftsLoaded]);

  const tabItems = [
    ...(canViewEmployees
      ? [{ value: "employees", label: copy.tabs.employees }]
      : []),
    { value: "attendance", label: copy.tabs.attendance },
    ...(canManageEmployees
      ? [
          { value: "payroll", label: copy.tabs.payroll },
          { value: "setup", label: copy.tabs.setup },
        ]
      : []),
  ];

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader
        eyebrow={workspaceCopy.eyebrow}
        title={
          isBranchManager
            ? workspaceCopy.branchManagerTitle
            : workspaceCopy.ownerTitle
        }
        description={
          isBranchManager
            ? workspaceCopy.branchManagerDescription
            : workspaceCopy.ownerDescription
        }
        actions={
          canManageEmployees ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="ghost">
                <Link href="/hr/staff">
                  <IconShieldCheck data-icon="inline-start" />
                  {copy.staffAccounts}
                </Link>
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <IconUserPlus data-icon="inline-start" />
                {copy.addEmployee}
              </Button>
            </div>
          ) : null
        }
      />

      <AppPageTabs items={tabItems} defaultValue={defaultTab}>
        {canViewEmployees ? (
          <TabsContent value="employees" className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {canManageEmployees
                ? copy.readinessSummary({
                    active: activeEmployees.length,
                    payrollReady: payrollReadyCount,
                    insured: insuredEmployees,
                    contractMissing: missingContractCount,
                  })
                : copy.employeeCount(employees.length)}
            </p>
            <EmployeeTable
              employees={employees}
              branches={branches}
              positionOptions={positionOptions}
              canManage={canManageEmployees}
            />
            {canManageEmployees ? (
              <EmployeeFormDialog
                open={addOpen}
                onOpenChange={setAddOpen}
                branches={branches}
                positionOptions={positionOptions}
              />
            ) : null}
          </TabsContent>
        ) : null}

        <TabsContent value="attendance" className="flex flex-col gap-4">
          <div className="flex max-w-3xl flex-col gap-1">
            <p className="font-heading text-base font-semibold">
              {copy.attendanceTitle}
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              {copy.attendanceDescription}
            </p>
          </div>
          <AttendanceTable branches={branches} />
          <LeaveRequestsTable branches={branches} />
        </TabsContent>

        {canManageEmployees ? (
          <TabsContent value="payroll" className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex max-w-3xl flex-col gap-1">
                <p className="font-heading text-base font-semibold">
                  {copy.payrollTitle}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {copy.payrollDescription}
                </p>
              </div>
              <Button asChild className="w-full sm:w-fit">
                <Link href="/hr/payroll">
                  <IconWalletCards data-icon="inline-start" />
                  {copy.openPayroll}
                </Link>
              </Button>
            </div>
          </TabsContent>
        ) : null}

        {canManageEmployees ? (
          <TabsContent value="setup" className="flex flex-col gap-4">
            <div className="flex max-w-3xl flex-col gap-1">
              <p className="font-heading text-base font-semibold">
                {copy.setupTitle}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {copy.setupDescription}
              </p>
            </div>
            <AppSection
              title={copy.setupSteps.shifts.title}
              description={copy.setupSteps.shifts.description}
              headerHint={copy.setupSteps.shifts.hint}
            >
              <ShiftsTable
                shifts={shifts}
                isPending={isPending}
                canManage={canManageEmployees}
                onShiftSaved={(shift) =>
                  setShifts((prev) => {
                    const exists = prev.some((item) => item.id === shift.id);
                    if (!exists) return [...prev, shift];
                    return prev.map((item) =>
                      item.id === shift.id ? { ...item, ...shift } : item,
                    );
                  })
                }
              />
            </AppSection>
            {canManagePositionTasks ? (
              <AppSection
                title={copy.positionTasks.title}
                description={copy.positionTasks.description}
                headerHint={copy.positionTasks.hint}
              >
                <PositionTasksClient initialData={positionTasksData} />
              </AppSection>
            ) : null}
          </TabsContent>
        ) : null}
      </AppPageTabs>
    </AppPage>
  );
}
