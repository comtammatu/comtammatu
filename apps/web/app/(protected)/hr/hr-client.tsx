"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { fetchShifts } from "./actions";
import { EmployeeTable } from "./employee-table";
import { EmployeeFormDialog } from "./employee-form-dialog";
import { ShiftsTable } from "./shifts-table";
import { AttendanceTable } from "./attendance-table";
import { LeaveRequestsTable } from "./leave-requests-table";
import { ChecklistTemplatesTable } from "./checklist-templates-table";
import { ChecklistCoveragePanel } from "./checklist-coverage-panel";
import { ConsumptionDefaultItemsTable } from "./consumption-default-items-table";
import { PositionDefaultsTable } from "./position-defaults-table";
import type { BranchOption, EmployeeRow, ShiftRow } from "./page";
import type {
  ChecklistTemplateRow,
  ConsumptionChecklistItemRow,
  ConsumptionDefaultIngredientRow,
  ConsumptionDefaultItemRow,
  PositionDefaultRow,
} from "./checklist-types";
import { toast } from "@comtammatu/ui/components/sonner";
import { Button } from "@comtammatu/ui/components/button";
import { AppSection } from "@/components/surface";
import {
  ShieldCheck as IconShieldCheck,
  UserPlus as IconUserPlus,
  WalletCards as IconWalletCards,
} from "lucide-react";

import { staffRoleFromPositionCode } from "@comtammatu/shared/auth";
import { messages } from "@lib/messages";

const copy = messages.hr.client;

interface HrClientProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  canManageEmployees: boolean;
  canViewEmployees: boolean;
  checklistTemplates: ChecklistTemplateRow[];
  consumptionChecklistItems: ConsumptionChecklistItemRow[];
  consumptionIngredients: ConsumptionDefaultIngredientRow[];
  consumptionDefaults: ConsumptionDefaultItemRow[];
  canManageGlobalChecklist: boolean;
  positionDefaults: PositionDefaultRow[];
}

export function HrClient({
  employees,
  branches,
  canManageEmployees,
  canViewEmployees,
  checklistTemplates,
  consumptionChecklistItems,
  consumptionIngredients,
  consumptionDefaults,
  canManageGlobalChecklist,
  positionDefaults,
}: HrClientProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [shifts, setShifts] = useState<ShiftRow[]>([]);
  const [shiftsLoaded, setShiftsLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultTab =
    canManageEmployees && canViewEmployees ? "employees" : "attendance";

  // One role option per access bucket (label = its Vietnamese position label),
  // mirroring /admin/staff. Owner/unassigned are not creatable here.
  const seenBuckets = new Set<string>();
  const positionOptions = positionDefaults.flatMap((position) => {
    const bucket = staffRoleFromPositionCode(position.code);
    if (bucket === "unassigned" || bucket === "owner" || seenBuckets.has(bucket)) {
      return [];
    }
    seenBuckets.add(bucket);
    return [{ value: bucket, label: position.label_vi ?? position.code }];
  });

  function loadShifts() {
    startTransition(async () => {
      const result = await fetchShifts();
      if (result.success) {
        setShifts((result.data as ShiftRow[]) ?? []);
        setShiftsLoaded(true);
      } else {
        toast.error(result.error ?? "Không thể tải ca làm việc");
      }
    });
  }

  function handleTabChange(value: string) {
    if (value === "setup" && !shiftsLoaded) {
      loadShifts();
    }
  }

  return (
    <Tabs defaultValue={defaultTab} onValueChange={handleTabChange}>
      <TabsList>
        {canViewEmployees ? (
          <TabsTrigger value="employees">{copy.tabs.employees}</TabsTrigger>
        ) : null}
        <TabsTrigger value="attendance">{copy.tabs.attendance}</TabsTrigger>
        {canManageEmployees ? (
          <TabsTrigger value="payroll">{copy.tabs.payroll}</TabsTrigger>
        ) : null}
        <TabsTrigger value="setup">{copy.tabs.setup}</TabsTrigger>
      </TabsList>

      {canViewEmployees ? (
        <TabsContent value="employees" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {copy.employeeCount(employees.length)}
            </p>
            {canManageEmployees ? (
              <div className="flex gap-2">
                <Button asChild variant="ghost">
                  <Link href="/admin/staff">
                    <IconShieldCheck data-icon="inline-start" />
                    {copy.staffAccounts}
                  </Link>
                </Button>
                <Button onClick={() => setAddOpen(true)}>
                  <IconUserPlus data-icon="inline-start" />
                  {copy.addEmployee}
                </Button>
              </div>
            ) : null}
          </div>
          <EmployeeTable
            employees={employees}
            checklistTemplates={checklistTemplates}
          />
          {canManageEmployees ? (
            <EmployeeFormDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              branches={branches}
              positionOptions={positionOptions}
              checklistTemplates={checklistTemplates}
            />
          ) : null}
        </TabsContent>
      ) : null}

      <TabsContent value="attendance" className="mt-4 flex flex-col gap-4">
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
        <TabsContent value="payroll" className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-3xl">
              <p className="font-heading text-base font-semibold">
                {copy.payrollTitle}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
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

      <TabsContent value="setup" className="mt-4 flex flex-col gap-6">
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
        <AppSection
          title={copy.setupSteps.checklist.title}
          description={copy.setupSteps.checklist.description}
          headerHint={copy.setupSteps.checklist.hint}
        >
          <ChecklistTemplatesTable
            branches={branches}
            initialTemplates={checklistTemplates}
            canManageGlobalChecklist={canManageGlobalChecklist}
          />
        </AppSection>
        <AppSection
          title={copy.setupSteps.consumption.title}
          description={copy.setupSteps.consumption.description}
          headerHint={copy.setupSteps.consumption.hint}
        >
          <ConsumptionDefaultItemsTable
            items={consumptionChecklistItems}
            ingredients={consumptionIngredients}
            defaults={consumptionDefaults}
          />
        </AppSection>
        {canManageGlobalChecklist ? (
          <AppSection
            title={copy.setupSteps.positions.title}
            description={copy.setupSteps.positions.description}
            headerHint={copy.setupSteps.positions.hint}
          >
            <PositionDefaultsTable
              positions={positionDefaults}
              templates={checklistTemplates}
            />
          </AppSection>
        ) : null}
        <ChecklistCoveragePanel
          employees={employees}
          positions={positionDefaults}
          templates={checklistTemplates}
          consumptionDefaults={consumptionDefaults}
        />
      </TabsContent>
    </Tabs>
  );
}
