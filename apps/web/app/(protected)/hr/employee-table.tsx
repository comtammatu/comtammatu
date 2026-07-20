"use client";

import { useMemo, useState } from "react";
import {
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Pencil as IconPencil,
  Search as IconSearch,
  Users as IconUsers,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI, BRANCH_VI, STAFF_VI } from "@comtammatu/shared/messages";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import type { BranchOption, EmployeeRow } from "./_types";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { AppSection, AppToolbar } from "@/components/surface";
import {
  CONTRACT_TYPE_OPTIONS,
  EmployeeFormDialog,
} from "./employee-form-dialog";

import { messages } from "@lib/messages";

interface EmployeeTableProps {
  employees: EmployeeRow[];
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  canManage: boolean;
}

const ALL_FILTER_VALUE = "all";
const UNASSIGNED_BRANCH_FILTER_VALUE = "unassigned-branch";
const UNASSIGNED_POSITION_FILTER_VALUE = "unassigned-position";
const SALARY_RECORDED_FILTER_VALUE = "salary-recorded";
const SALARY_MISSING_FILTER_VALUE = "salary-missing";

export function EmployeeTable({
  employees,
  branches,
  positionOptions,
  canManage,
}: EmployeeTableProps) {
  const [editEmployee, setEditEmployee] = useState<EmployeeRow | null>(null);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [branchFilter, setBranchFilter] = useState(ALL_FILTER_VALUE);
  const [positionFilter, setPositionFilter] = useState(ALL_FILTER_VALUE);
  const [salaryFilter, setSalaryFilter] = useState(ALL_FILTER_VALUE);
  const [contractTypeFilter, setContractTypeFilter] =
    useState(ALL_FILTER_VALUE);
  const filteredEmployees = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("vi-VN");
    return employees.filter((employee) => {
      const branchId = employee.profiles?.branch_id;
      const positionCode = employee.profiles?.positions?.code;
      const hasSalary = Number(employee.base_salary ?? 0) > 0;
      const matchesBranch =
        branchFilter === ALL_FILTER_VALUE ||
        (branchFilter === UNASSIGNED_BRANCH_FILTER_VALUE
          ? branchId == null
          : String(branchId) === branchFilter);
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
      const matchesSearch =
        !normalized ||
        [
          employee.profiles?.full_name,
          employee.employee_code,
          employee.profiles?.branches?.name,
          employee.profiles?.positions?.label_vi,
        ]
          .filter(Boolean)
          .some((value) =>
            value!.toLocaleLowerCase("vi-VN").includes(normalized),
          );
      return (
        (showInactive || employee.is_active) &&
        matchesBranch &&
        matchesPosition &&
        matchesSalary &&
        matchesContractType &&
        matchesSearch
      );
    });
  }, [
    branchFilter,
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

  function renderEdit(employee: EmployeeRow, touch = false) {
    return (
      <Button
        variant="ghost"
        size={touch ? "touch" : "sm"}
        onClick={() => setEditEmployee(employee)}
      >
        <IconPencil data-icon="inline-start" />
        {ACTIONS_VI.edit}
      </Button>
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
      key: "branch",
      header: BRANCH_VI.long,
      className: "text-muted-foreground",
      render: (employee) => employee.profiles?.branches?.name ?? "—",
    },
    {
      key: "role",
      header: STAFF_VI.role,
      render: (employee) =>
        employee.profiles?.positions?.label_vi ? (
          <Badge variant="secondary">
            {employee.profiles.positions.label_vi}
          </Badge>
        ) : (
          "—"
        ),
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
    ...(canManage
      ? [
          {
            key: "actions",
            header: "",
            className: "w-20 text-right",
            render: (employee) => renderEdit(employee),
          } satisfies DataTableColumn<EmployeeRow>,
        ]
      : []),
  ];

  return (
    <>
      <AppToolbar
        search={
          <InputGroup className="min-w-0 flex-1 sm:min-w-64">
            <InputGroupAddon>
              <IconSearch aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label={messages.hr.client.employeeSearch}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={messages.hr.client.employeeSearch}
            />
          </InputGroup>
        }
        filters={
          <>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="min-w-40" aria-label={BRANCH_VI.long}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>
                  {messages.hr.client.allBranches}
                </SelectItem>
                <SelectItem value={UNASSIGNED_BRANCH_FILTER_VALUE}>
                  {messages.hr.client.unassignedBranch}
                </SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger className="min-w-40" aria-label={STAFF_VI.role}>
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
              <Select value={salaryFilter} onValueChange={setSalaryFilter}>
                <SelectTrigger
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
                onValueChange={setContractTypeFilter}
              >
                <SelectTrigger
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
            size="touch"
            onClick={() => setShowInactive((current) => !current)}
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
      <AppSection contentFlush contentScroll>
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
                  {employee.employee_code ? `${employee.employee_code} · ` : ""}
                  {employee.profiles?.branches?.name ?? "—"}
                </ItemDescription>
                <div className="flex flex-wrap gap-2">
                  {employee.profiles?.positions?.label_vi ? (
                    <Badge variant="secondary" className="w-fit">
                      {employee.profiles.positions.label_vi}
                    </Badge>
                  ) : null}
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
                {canManage ? renderEdit(employee, true) : null}
              </ItemActions>
            </Item>
          )}
        />
      </AppSection>
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
    </>
  );
}
