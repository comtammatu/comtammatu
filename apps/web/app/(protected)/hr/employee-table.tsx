"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList as IconClipboardList,
  Clock as IconClock,
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Pencil as IconPencil,
  Search as IconSearch,
  Users as IconUsers,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
import {
  ACTIONS_VI,
  BRANCH_VI,
  FORM_VI,
  STAFF_VI,
} from "@comtammatu/shared/messages";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@comtammatu/ui/components/button";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type {
  BranchOption,
  EmployeeRow,
  EmployeeShiftOption,
  EmployeeTodayShiftAssignment,
} from "./_types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { z } from "zod";
import { AppDialog, FormDialog, SelectField } from "@/components/form";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { CONTRACT_TYPE_OPTIONS, EmployeeFormDialog } from "./employee-form-dialog";
import {
  clearEmployeeShiftTaskOverride,
  type PositionTasksData,
} from "./position-tasks-actions";
import { EmployeeTaskOverrideDialog } from "./position-tasks-client";
import { setEmployeeTodayShiftAssignment } from "@lib/hr/roster/actions";

import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";

interface EmployeeTableProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  canManage: boolean;
  canAssignShift?: boolean;
  canManageTasks?: boolean;
  shifts?: EmployeeShiftOption[];
  todayAssignments?: EmployeeTodayShiftAssignment[];
  positionTasksData?: PositionTasksData | null;
  /** URL-driven salary filter: `missing` maps to salary-missing. */
  initialSalaryFilter?: "all" | "missing" | "recorded";
}

const ALL_FILTER_VALUE = "all";
const UNASSIGNED_POSITION_FILTER_VALUE = "unassigned-position";
const SALARY_RECORDED_FILTER_VALUE = "salary-recorded";
const SALARY_MISSING_FILTER_VALUE = "salary-missing";
const NO_SHIFT_VALUE = "__no_shift__";

const todayShiftSchema = z.object({
  shiftId: z.string(),
});
type TodayShiftFormValues = z.infer<typeof todayShiftSchema>;

export function EmployeeTable({
  employees,
  branches,
  positionOptions,
  canManage,
  canAssignShift = false,
  canManageTasks = false,
  shifts = [],
  todayAssignments = [],
  positionTasksData = null,
  initialSalaryFilter = "all",
}: EmployeeTableProps) {
  const quickCopy = messages.hr.client.quickConfig;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const [isPending, startTransition] = useTransition();
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [taskEmployeeId, setTaskEmployeeId] = useState<number | null>(null);
  const [clearTaskEmployee, setClearTaskEmployee] =
    useState<EmployeeRow | null>(null);
  const [shiftEmployee, setShiftEmployee] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [showInactive, setShowInactive] = useState(
    () => searchParams.get("inactive") === "1",
  );
  const [positionFilter, setPositionFilter] = useState(
    () => searchParams.get("position") ?? ALL_FILTER_VALUE,
  );
  const [salaryFilter, setSalaryFilter] = useState(() => {
    if (initialSalaryFilter === "missing") return SALARY_MISSING_FILTER_VALUE;
    if (initialSalaryFilter === "recorded") return SALARY_RECORDED_FILTER_VALUE;
    const fromUrl = searchParams.get("salary");
    if (fromUrl === "missing") return SALARY_MISSING_FILTER_VALUE;
    if (fromUrl === "recorded") return SALARY_RECORDED_FILTER_VALUE;
    return ALL_FILTER_VALUE;
  });
  const [contractTypeFilter, setContractTypeFilter] = useState(
    () => searchParams.get("contract") ?? ALL_FILTER_VALUE,
  );

  const replacePeopleFilters = useCallback(
    (patch: {
      q?: string | null;
      position?: string;
      salary?: string;
      contract?: string;
      inactive?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams.toString());
      const nextQ = patch.q !== undefined ? patch.q : search;
      const nextPosition =
        patch.position !== undefined ? patch.position : positionFilter;
      const nextSalary =
        patch.salary !== undefined ? patch.salary : salaryFilter;
      const nextContract =
        patch.contract !== undefined ? patch.contract : contractTypeFilter;
      const nextInactive =
        patch.inactive !== undefined ? patch.inactive : showInactive;

      const trimmedQ = nextQ?.trim() ?? "";
      if (trimmedQ) next.set("q", trimmedQ);
      else next.delete("q");

      if (!nextPosition || nextPosition === ALL_FILTER_VALUE) {
        next.delete("position");
      } else {
        next.set("position", nextPosition);
      }

      if (nextSalary === SALARY_MISSING_FILTER_VALUE) next.set("salary", "missing");
      else if (nextSalary === SALARY_RECORDED_FILTER_VALUE) {
        next.set("salary", "recorded");
      } else next.delete("salary");

      if (!nextContract || nextContract === ALL_FILTER_VALUE) {
        next.delete("contract");
      } else {
        next.set("contract", nextContract);
      }

      if (nextInactive) next.set("inactive", "1");
      else next.delete("inactive");

      const query = next.toString();
      const current = searchParams.toString();
      if (query === current) return;
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [
      contractTypeFilter,
      pathname,
      positionFilter,
      router,
      salaryFilter,
      search,
      searchParams,
      showInactive,
      startTransition,
    ],
  );

  useEffect(() => {
    setSearch(searchParams.get("q") ?? "");
    setPositionFilter(searchParams.get("position") ?? ALL_FILTER_VALUE);
    const salary = searchParams.get("salary");
    setSalaryFilter(
      salary === "missing"
        ? SALARY_MISSING_FILTER_VALUE
        : salary === "recorded"
          ? SALARY_RECORDED_FILTER_VALUE
          : ALL_FILTER_VALUE,
    );
    setContractTypeFilter(searchParams.get("contract") ?? ALL_FILTER_VALUE);
    setShowInactive(searchParams.get("inactive") === "1");
  }, [searchParams]);
  const assignmentByEmployee = useMemo(
    () =>
      new Map(
        todayAssignments.map((assignment) => [
          assignment.employee_id,
          assignment.shift_id,
        ]),
      ),
    [todayAssignments],
  );
  const filteredEmployees = useMemo(() => {
    const normalized = search.trim();
    return employees.filter((employee) => {
      const positionCode = employee.profiles?.positions?.code;
      const hasSalary = Number(employee.base_salary ?? 0) > 0;
      const matchesPosition =
        positionFilter === ALL_FILTER_VALUE ||
        (positionFilter === UNASSIGNED_POSITION_FILTER_VALUE
          ? positionCode == null
          : positionCode === positionFilter);
      const matchesSalary =
        salaryFilter === ALL_FILTER_VALUE ||
        (salaryFilter === SALARY_RECORDED_FILTER_VALUE
          ? hasSalary
          : !hasSalary);
      const matchesContractType =
        contractTypeFilter === ALL_FILTER_VALUE ||
        (employee.contract_type ?? "none") === contractTypeFilter;
      const matchesQuery =
        !normalized ||
        matchesSearch(
          [
            employee.profiles?.full_name,
            employee.employee_code,
            employee.profiles?.branches?.name,
            employee.profiles?.positions?.label_vi,
          ],
          normalized,
        );
      return (
        (showInactive || employee.is_active) &&
        matchesPosition &&
        matchesSalary &&
        matchesContractType &&
        matchesQuery
      );
    });
  }, [
    contractTypeFilter,
    employees,
    positionFilter,
    salaryFilter,
    search,
    showInactive,
  ]);

  function renderStatus(employee: EmployeeRow) {
    return (
      <StatusBadge
        domain="active-state"
        value={employee.is_active ? "active" : "inactive"}
      />
    );
  }

  function renderSalary(employee: EmployeeRow) {
    const amount = Number(employee.base_salary ?? 0);
    return amount > 0 ? formatVND(amount) : "—";
  }

  function renderContractType(employee: EmployeeRow) {
    return (
      CONTRACT_TYPE_OPTIONS.find(
        (option) => option.value === employee.contract_type,
      )?.label ?? CONTRACT_TYPE_OPTIONS[0].label
    );
  }

  function runQuickUpdate(
    action: () => Promise<{ success: boolean; error?: string }>,
    successMessage: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.success) {
        toast.error(result.error ?? quickCopy.updateFailed);
        return;
      }
      toast.success(successMessage);
      router.refresh();
    });
  }

  function positionLabel(employee: EmployeeRow) {
    return employee.profiles?.positions?.label_vi ?? quickCopy.noPosition;
  }

  function branchLabel(employee: EmployeeRow) {
    return employee.profiles?.branches?.name ?? quickCopy.office;
  }

  function todayShiftLabel(employee: EmployeeRow) {
    const shiftId = assignmentByEmployee.get(employee.id);
    const shift = shifts.find((item) => item.id === shiftId);
    if (!shift) return quickCopy.noShift;
    return `${shift.name} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)})`;
  }

  function taskRow(employee: EmployeeRow) {
    const taskEmployee = positionTasksData?.employees.find(
      (item) => item.id === employee.id,
    );
    const template = positionTasksData?.employeeTemplates.find(
      (item) => item.employeeId === employee.id,
    );
    const inheritedTasks =
      taskEmployee?.positionId == null
        ? []
        : (positionTasksData?.tasksByPosition[taskEmployee.positionId] ?? []);
    return {
      hasOverride: template != null,
      count: (template?.tasks ?? inheritedTasks).length,
    };
  }

  function rowActions(employee: EmployeeRow): RowActionItem[] {
    const task = taskRow(employee);
    const items: RowActionItem[] = [];
    if (canManage) {
      items.push({
        key: "edit",
        label: ACTIONS_VI.edit,
        icon: <IconPencil />,
        onSelect: () => setEditEmployee(employee),
      });
    }
    if (canAssignShift) {
      items.push({
        key: "today-shift",
        label: quickCopy.todayShift,
        icon: <IconClock />,
        disabled: !employee.is_active || isPending,
        onSelect: () => setShiftEmployee(employee),
      });
    }
    if (canManageTasks) {
      items.push({
        key: "configure-tasks",
        label: task.hasOverride
          ? messages.hr.client.positionTasks.editTemplate
          : messages.hr.client.positionTasks.createEmployeeTemplate,
        icon: <IconClipboardList />,
        disabled: !positionTasksData,
        onSelect: () => setTaskEmployeeId(employee.id),
      });
      if (task.hasOverride) {
        items.push({
          key: "clear-tasks",
          label: quickCopy.usePositionTasks,
          destructive: true,
          separatorBefore: true,
          onSelect: () => setClearTaskEmployee(employee),
        });
      }
    }
    return items;
  }

  function renderRowMenu(employee: EmployeeRow, touch = false) {
    const items = rowActions(employee);
    if (items.length === 0) return null;
    return (
      <RowActionsMenu
        items={items}
        label={`${FORM_VI.action} ${employee.profiles?.full_name ?? STAFF_VI.long}`}
        triggerSize={touch ? "touch" : "icon-sm"}
        triggerLabel={touch ? ACTIONS_VI.edit : undefined}
      />
    );
  }

  const columns: DataTableColumn<EmployeeRow>[] = [
    {
      key: "index",
      header: "#",
      className: "w-12 text-right",
      render: (_, index) => (
        <span className="font-mono tabular-nums text-muted-foreground">
          {index + 1}
        </span>
      ),
    },
    {
      key: "name",
      header: STAFF_VI.long,
      render: (employee) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">
            {employee.profiles?.full_name ?? "—"}
          </span>
          {employee.employee_code ? (
            <span className="text-xs text-muted-foreground">
              {employee.employee_code}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "role",
      header: STAFF_VI.role,
      render: (employee) => positionLabel(employee),
    },
    {
      key: "branch",
      header: BRANCH_VI.long,
      render: (employee) => branchLabel(employee),
    },
    {
      key: "todayShift",
      header: quickCopy.todayShift,
      render: (employee) => todayShiftLabel(employee),
    },
    {
      key: "shiftTasks",
      header: quickCopy.shiftTasks,
      render: (employee) => {
        const task = taskRow(employee);
        return `${task.hasOverride ? quickCopy.employeeTemplateShort : quickCopy.positionTemplateShort} · ${task.count}`;
      },
    },
    ...(canManage
      ? [
          {
            key: "salary",
            header: messages.hr.client.salary,
            className: "font-mono tabular-nums",
            render: renderSalary,
          } satisfies DataTableColumn<EmployeeRow>,
          {
            key: "contractType",
            header: messages.hr.client.contractType,
            className: "text-muted-foreground",
            render: renderContractType,
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
    {
      key: "status",
      header: messages.hr.client.employmentStatus,
      render: renderStatus,
    },
    ...(canManage || canAssignShift || canManageTasks
      ? [
          {
            key: "actions",
            header: <span className="sr-only">{FORM_VI.action}</span>,
            className: "w-20 text-right",
            render: (employee) => renderRowMenu(employee),
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
  ];

  return (
    <>
      <AppListFrame
        contentScroll
        toolbar={
          <AppToolbar
            variant="inline"
            search={
              <InputGroup
                size={controlSize}
                className="min-w-0 flex-1 sm:min-w-64"
              >
                <InputGroupAddon>
                  <IconSearch aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  aria-label={messages.hr.client.employeeSearch}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      replacePeopleFilters({ q: search });
                    }
                  }}
                  onBlur={() => replacePeopleFilters({ q: search })}
                  placeholder={messages.hr.client.employeeSearch}
                />
              </InputGroup>
            }
            filters={
              <>
                <Select
                  value={positionFilter}
                  onValueChange={(value) => {
                    setPositionFilter(value);
                    replacePeopleFilters({ position: value });
                  }}
                >
                  <SelectTrigger
                    size={controlSize}
                    className="min-w-40"
                    aria-label={STAFF_VI.role}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>
                      {messages.hr.client.allPositions}
                    </SelectItem>
                    <SelectItem value={UNASSIGNED_POSITION_FILTER_VALUE}>
                      {messages.hr.client.unassignedPosition}
                    </SelectItem>
                    {positionOptions.map((position) => (
                      <SelectItem key={position.value} value={position.value}>
                        {position.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canManage ? (
                  <Select
                    value={salaryFilter}
                    onValueChange={(value) => {
                      setSalaryFilter(value);
                      replacePeopleFilters({ salary: value });
                    }}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="min-w-36"
                      aria-label={messages.hr.client.salary}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTER_VALUE}>
                        {messages.hr.client.allSalaries}
                      </SelectItem>
                      <SelectItem value={SALARY_RECORDED_FILTER_VALUE}>
                        {messages.hr.client.salaryRecorded}
                      </SelectItem>
                      <SelectItem value={SALARY_MISSING_FILTER_VALUE}>
                        {messages.hr.client.salaryMissing}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                {canManage ? (
                  <Select
                    value={contractTypeFilter}
                    onValueChange={(value) => {
                      setContractTypeFilter(value);
                      replacePeopleFilters({ contract: value });
                    }}
                  >
                    <SelectTrigger
                      size={controlSize}
                      className="min-w-40"
                      aria-label={messages.hr.client.contractType}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_FILTER_VALUE}>
                        {messages.hr.client.allContractTypes}
                      </SelectItem>
                      {CONTRACT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </>
            }
            actions={
              <Button
                variant="outline"
                size={controlSize}
                onClick={() => {
                  const next = !showInactive;
                  setShowInactive(next);
                  replacePeopleFilters({ inactive: next });
                }}
              >
                {showInactive ? (
                  <IconEyeOff data-icon="inline-start" />
                ) : (
                  <IconEye data-icon="inline-start" />
                )}
                {showInactive
                  ? messages.hr.client.hideInactiveEmployees
                  : messages.hr.client.showInactiveEmployees}
              </Button>
            }
          />
        }
      >
        <DataTable
          columns={columns}
          data={filteredEmployees}
          pageSize={25}
          getRowKey={(employee) => employee.id}
          emptyTitle={messages.hr.client.employeeEmpty}
          emptyIcon={<IconUsers />}
          mobileCardRender={(employee, index) => (
            <Item variant="outline">
              <ItemContent>
                <ItemTitle size="heading" className="line-clamp-none">
                  #{index + 1} · {employee.profiles?.full_name ?? "—"}
                </ItemTitle>
                <ItemDescription className="line-clamp-none text-sm leading-6">
                  {[
                    employee.employee_code,
                    positionLabel(employee),
                    branchLabel(employee),
                    todayShiftLabel(employee),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </ItemDescription>
                <div className="flex flex-wrap gap-2">
                  {canManage ? (
                    <Badge variant="outline">
                      {renderContractType(employee)}
                    </Badge>
                  ) : null}
                </div>
                {canManage ? (
                  <ItemDescription className="font-mono tabular-nums">
                    {messages.hr.client.salary}: {renderSalary(employee)}
                  </ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions className="flex flex-col items-end gap-2">
                {renderStatus(employee)}
                {canManage || canAssignShift || canManageTasks
                  ? renderRowMenu(employee, true)
                  : null}
              </ItemActions>
            </Item>
          )}
          renderRowContextMenu={(employee) => {
            const items = rowActions(employee);
            if (items.length === 0) return null;
            return <RowActionsContextMenuItems items={items} />;
          }}
        />
      </AppListFrame>
      {canManage ? (
        <EmployeeFormDialog
          open={!!editEmployee}
          onOpenChange={(open) => !open && setEditEmployee(null)}
          mode="edit"
          employee={editEmployee}
          branches={branches}
          positionOptions={positionOptions}
        />
      ) : null}
      {canAssignShift && shiftEmployee ? (
        <FormDialog<TodayShiftFormValues>
          open
          onOpenChange={(open) => !open && setShiftEmployee(null)}
          title={quickCopy.todayShift}
          schema={todayShiftSchema}
          defaultValues={{
            shiftId:
              assignmentByEmployee.get(shiftEmployee.id)?.toString() ??
              NO_SHIFT_VALUE,
          }}
          entityKey={shiftEmployee.id}
          submitLabel={quickCopy.saveTodayShift}
          onSubmit={async (values) =>
            setEmployeeTodayShiftAssignment({
              employeeId: shiftEmployee.id,
              branchId: shiftEmployee.profiles?.branch_id ?? null,
              shiftId:
                values.shiftId === NO_SHIFT_VALUE
                  ? null
                  : Number(values.shiftId),
            })
          }
          successMessage={quickCopy.shiftUpdated}
          onSuccess={() => {
            setShiftEmployee(null);
            router.refresh();
          }}
        >
          {(form) => (
            <SelectField
              control={form.control}
              name="shiftId"
              label={quickCopy.todayShift}
              options={[
                { value: NO_SHIFT_VALUE, label: quickCopy.noShift },
                ...shifts.map((shift) => ({
                  value: String(shift.id),
                  label: `${shift.name} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)})`,
                })),
              ]}
            />
          )}
        </FormDialog>
      ) : null}
      {positionTasksData ? (
        <EmployeeTaskOverrideDialog
          employeeId={taskEmployeeId}
          open={taskEmployeeId != null}
          onOpenChange={(open) => !open && setTaskEmployeeId(null)}
          data={positionTasksData}
          onSaved={() => router.refresh()}
        />
      ) : null}
      <AppDialog
        open={clearTaskEmployee != null}
        onOpenChange={(open) => !open && setClearTaskEmployee(null)}
        title={quickCopy.usePositionTasksTitle}
        description={quickCopy.usePositionTasksDescription}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearTaskEmployee(null)}
              disabled={isPending}
            >
              {messages.hr.client.positionTasks.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending || clearTaskEmployee == null}
              onClick={() => {
                if (!clearTaskEmployee) return;
                const employeeId = clearTaskEmployee.id;
                runQuickUpdate(
                  () => clearEmployeeShiftTaskOverride({ employeeId }),
                  quickCopy.positionTasksRestored,
                );
                setClearTaskEmployee(null);
              }}
            >
              {quickCopy.usePositionTasks}
            </Button>
          </div>
        }
      />
    </>
  );
}
