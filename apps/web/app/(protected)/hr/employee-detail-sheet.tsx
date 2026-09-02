"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Clock as IconClock,
  KeyRound as IconKeyRound,
  Lock as IconLock,
  Pencil as IconPencil,
  Shield as IconShield,
  Trash2 as IconTrash2,
  Unlock as IconUnlock,
  UserMinus as IconUserMinus,
} from "lucide-react";
import { AppSheet } from "@/components/surface/app-sheet";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Badge } from "@comtammatu/ui/components/badge";
import { FieldGroup } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVND } from "@comtammatu/shared/format";
import { StatusBadge } from "@/components/status-badge";
import {
  resetEmployeePassword,
  toggleEmployeeLoginAccess,
  deleteDraftEmployee,
} from "./actions";
import type {
  BranchOption,
  EmployeeRow,
  EmployeeShiftOption,
} from "./_types";
import type { PositionTasksData } from "./position-tasks-actions";
import { CONTRACT_TYPE_OPTIONS } from "./employee-form-dialog";
import { messages } from "@lib/messages";

const copy = messages.hr.client.employeeDetail;
const quickCopy = messages.hr.client.quickConfig;
const taskCopy = messages.hr.client.positionTasks;

interface EmployeeDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRow | null;
  branches: BranchOption[];
  positionOptions: { value: string; label: string }[];
  shifts?: EmployeeShiftOption[];
  todayAssignmentShiftId?: number | null;
  positionTasksData?: PositionTasksData | null;
  canManage: boolean;
  canAssignShift?: boolean;
  canManageTasks?: boolean;
  onEditQuick?: (employee: EmployeeRow) => void;
  onOffboard?: (employee: EmployeeRow) => void;
  onOpenShiftDialog?: (employee: EmployeeRow) => void;
  onOpenTaskDialog?: (employee: EmployeeRow) => void;
  onClearTaskOverride?: (employee: EmployeeRow) => void;
}

type DetailTab = "profile" | "tasks" | "compensation" | "account";

export function EmployeeDetailSheet({
  open,
  onOpenChange,
  employee,
  branches: _branches,
  positionOptions: _positionOptions,
  shifts = [],
  todayAssignmentShiftId = null,
  positionTasksData = null,
  canManage,
  canAssignShift = false,
  canManageTasks = false,
  onEditQuick,
  onOffboard,
  onOpenShiftDialog,
  onOpenTaskDialog,
  onClearTaskOverride,
}: EmployeeDetailSheetProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DetailTab>("profile");
  const [isPending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState("");
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!employee) return null;

  const profile = employee.profiles;
  const isLoginActive = profile?.is_active ?? employee.is_active;
  const activeContract = [...(employee.employment_contracts ?? [])]
    .filter((c) => c.status === "active")
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];

  const shift = shifts.find((s) => s.id === todayAssignmentShiftId);

  // Check tasks
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
  const activeTasks = template ? template.tasks : inheritedTasks;
  const hasOverride = template != null;

  const contractLabel =
    CONTRACT_TYPE_OPTIONS.find((o) => o.value === employee.contract_type)
      ?.label ?? copy.notRecorded;

  function handleResetPassword() {
    if (!employee) return;
    if (newPassword.trim().length < 8) {
      toast.error(copy.passwordTooShort);
      return;
    }
    startTransition(async () => {
      const res = await resetEmployeePassword({
        employeeId: employee.id,
        newPassword: newPassword.trim(),
      });
      if (!res.success) {
        toast.error(res.error ?? copy.resetFailed);
        return;
      }
      toast.success(copy.resetSuccess);
      setNewPassword("");
      setShowPasswordInput(false);
    });
  }

  function handleToggleLogin() {
    if (!employee) return;
    startTransition(async () => {
      const res = await toggleEmployeeLoginAccess({
        employeeId: employee.id,
        canLogin: !isLoginActive,
      });
      if (!res.success) {
        toast.error(res.error ?? copy.loginUpdateFailed);
        return;
      }
      toast.success(
        !isLoginActive ? copy.loginEnabled : copy.loginDisabled,
      );
      router.refresh();
    });
  }

  function handleDeleteDraft() {
    if (!employee) return;
    startTransition(async () => {
      const res = await deleteDraftEmployee({ employeeId: employee.id });
      if (!res.success) {
        toast.error(res.error ?? copy.deleteFailed);
        return;
      }
      toast.success(copy.deleteSuccess);
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <AppSheet
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={
        <div className="flex items-center justify-between gap-3 pr-4">
          <div className="flex flex-col gap-1">
            <span className="text-base font-semibold">
              {profile?.full_name ?? copy.fallbackTitle}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {[
                employee.employee_code ?? `NV#${employee.id}`,
                profile?.positions?.label_vi ?? quickCopy.noPosition,
                profile?.branches?.name ?? quickCopy.office,
              ].join(" · ")}
            </span>
          </div>
          <StatusBadge
            domain="active-state"
            value={employee.is_active ? "active" : "inactive"}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Quick Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border/40">
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                onOpenChange(false);
                onEditQuick?.(employee);
              }}
            >
              <IconPencil className="size-3.5" />
              {copy.editProfile}
            </Button>
          ) : null}

          {canAssignShift ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              disabled={!employee.is_active}
              onClick={() => {
                onOpenChange(false);
                onOpenShiftDialog?.(employee);
              }}
            >
              <IconClock className="size-3.5" />
              {copy.changeTodayShift}
            </Button>
          ) : null}

          {canManage && employee.is_active ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                onOpenChange(false);
                onOffboard?.(employee);
              }}
            >
              <IconUserMinus className="size-3.5" />
              {copy.offboard}
            </Button>
          ) : null}
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap gap-1 border-b border-border/60 pb-2">
          <Button
            type="button"
            variant={activeTab === "profile" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("profile")}
          >
            {copy.tabProfile}
          </Button>
          <Button
            type="button"
            variant={activeTab === "tasks" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("tasks")}
          >
            {copy.tabTasks(activeTasks.length)}
          </Button>
          <Button
            type="button"
            variant={activeTab === "compensation" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("compensation")}
          >
            {copy.tabCompensation}
          </Button>
          <Button
            type="button"
            variant={activeTab === "account" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("account")}
          >
            {copy.tabAccount}
          </Button>
        </div>

        {/* Tab 1: Profile & Placement */}
        {activeTab === "profile" ? (
          <div className="flex flex-col gap-4">
            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  {copy.jobInfo}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{copy.position}</span>
                  <p className="font-medium mt-1">
                    {profile?.positions?.label_vi ?? quickCopy.noPosition}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.workplace}</span>
                  <p className="font-medium mt-1">
                    {profile?.branches?.name ?? quickCopy.office}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.employeeCode}</span>
                  <p className="font-medium mt-1">
                    {employee.employee_code || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.startDate}</span>
                  <p className="font-medium mt-1">
                    {employee.start_date || "—"}
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  {copy.contactPay}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{copy.phone}</span>
                  <p className="font-medium mt-1">
                    {profile?.phone || copy.noPhone}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.idNumber}</span>
                  <p className="font-medium mt-1">
                    {employee.id_number || "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    {copy.bankAccount}
                  </span>
                  <p className="font-medium mt-1">
                    {employee.bank_account
                      ? `${employee.bank_account} ${employee.bank_name ? `(${employee.bank_name})` : ""}`
                      : copy.notRecorded}
                  </p>
                </div>
              </div>
            </FieldGroup>
          </div>
        ) : null}

        {/* Tab 2: Shift & Tasks */}
        {activeTab === "tasks" ? (
          <div className="flex flex-col gap-4">
            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <p className="font-heading text-sm font-semibold">
                  {copy.todayShift}
                </p>
                {canAssignShift ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      onOpenChange(false);
                      onOpenShiftDialog?.(employee);
                    }}
                  >
                    {copy.changeShift}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-muted text-primary">
                  <IconClock className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {shift
                      ? `${shift.name} (${shift.start_time.slice(0, 5)} – ${shift.end_time.slice(0, 5)})`
                      : copy.noShiftToday}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shift ? copy.shiftPunchHint : copy.assignShiftHint}
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-heading text-sm font-semibold">
                    {copy.shiftTasksTitle(activeTasks.length)}
                  </p>
                  <Badge variant={hasOverride ? "default" : "secondary"}>
                    {hasOverride
                      ? quickCopy.employeeTemplateShort
                      : quickCopy.positionTemplateShort}
                  </Badge>
                </div>
                {canManageTasks ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        onOpenChange(false);
                        onOpenTaskDialog?.(employee);
                      }}
                    >
                      {hasOverride
                        ? copy.editEmployeeTemplate
                        : taskCopy.createEmployeeTemplate}
                    </Button>
                    {hasOverride ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive"
                        onClick={() => {
                          onClearTaskOverride?.(employee);
                        }}
                      >
                        {copy.restorePositionTemplate}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {activeTasks.length > 0 ? (
                <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                  {activeTasks.map((task, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded bg-muted/30 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{task.title}</span>
                        {task.isRequired ? (
                          <Badge variant="outline">{copy.required}</Badge>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground">
                        {task.phase === "start_of_shift"
                          ? taskCopy.phaseLabels.start_of_shift
                          : task.phase === "end_of_shift"
                            ? taskCopy.phaseLabels.end_of_shift
                            : copy.phaseDuring}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  {copy.noTaskTemplate}
                </p>
              )}
            </FieldGroup>
          </div>
        ) : null}

        {/* Tab 3: Compensation & Contract */}
        {activeTab === "compensation" ? (
          <div className="flex flex-col gap-4">
            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  {copy.compensationTitle}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{copy.wageUnit}</span>
                  <p className="font-medium mt-1">
                    {activeContract?.wage_unit === "daily"
                      ? copy.dailyWage
                      : copy.monthlyWage}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.payBasis}</span>
                  <p className="font-medium mt-1">
                    {activeContract?.pay_basis === "fixed_monthly"
                      ? copy.fixedMonthly
                      : copy.attendanceProrated}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {activeContract?.wage_unit === "daily"
                      ? copy.dailyRate
                      : copy.baseSalary}
                  </span>
                  <p className="font-semibold text-primary mt-1">
                    {activeContract?.wage_unit === "daily"
                      ? activeContract.daily_rate
                        ? formatVND(activeContract.daily_rate)
                        : "—"
                      : employee.base_salary
                        ? formatVND(employee.base_salary)
                        : "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.insuranceBase}</span>
                  <p className="font-medium mt-1">
                    {(employee.insurance_base_salary ?? 0) > 0
                      ? formatVND(employee.insurance_base_salary ?? 0)
                      : copy.noInsurance}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.dependents}</span>
                  <p className="font-medium mt-1">
                    {copy.dependentsValue(employee.dependents_count)}
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  {copy.contractTitle}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">{copy.contractType}</span>
                  <p className="font-medium mt-1">{contractLabel}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.contractNumber}</span>
                  <p className="font-medium mt-1">
                    {activeContract?.contract_number || copy.notRecorded}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.signedDate}</span>
                  <p className="font-medium mt-1">
                    {activeContract?.signed_date || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">{copy.endDate}</span>
                  <p className="font-medium mt-1">
                    {activeContract?.end_date || copy.indefinite}
                  </p>
                </div>
              </div>
            </FieldGroup>
          </div>
        ) : null}

        {/* Tab 4: Account & Security */}
        {activeTab === "account" ? (
          <div className="flex flex-col gap-4">
            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    {copy.loginStatus}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {copy.loginStatusHint}
                  </p>
                </div>
                {canManage ? (
                  <Button
                    variant={isLoginActive ? "outline" : "default"}
                    size="sm"
                    className="h-8 text-xs gap-1"
                    disabled={isPending}
                    onClick={handleToggleLogin}
                  >
                    {isLoginActive ? (
                      <>
                        <IconLock className="size-3.5" />
                        {copy.lockLogin}
                      </>
                    ) : (
                      <>
                        <IconUnlock className="size-3.5" />
                        {copy.unlockLogin}
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">{copy.statusLabel}</span>
                <Badge variant={isLoginActive ? "default" : "destructive"}>
                  {isLoginActive ? copy.loginAllowed : copy.loginLocked}
                </Badge>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    {copy.passwordTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {copy.passwordHint}
                  </p>
                </div>
                {canManage && !showPasswordInput ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setShowPasswordInput(true)}
                  >
                    <IconKeyRound className="size-3.5" />
                    {copy.resetPassword}
                  </Button>
                ) : null}
              </div>
              {showPasswordInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder={copy.newPasswordPlaceholder}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="h-8 flex-1 text-xs"
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    disabled={isPending || newPassword.trim().length < 8}
                    onClick={handleResetPassword}
                  >
                    {copy.savePassword}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setShowPasswordInput(false);
                      setNewPassword("");
                    }}
                  >
                    {quickCopy.cancel}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {copy.passwordEncryptedHint}
                </p>
              )}
            </FieldGroup>

            {profile?.id ? (
              <FieldGroup className="gap-3 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-sm font-semibold">
                      {copy.permissionsTitle}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {copy.permissionsHint}
                    </p>
                  </div>
                  <Link
                    href={`/hr/staff/${profile.id}/permissions`}
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    <IconShield className="size-3.5" />
                    {copy.openPermissions}
                  </Link>
                </div>
              </FieldGroup>
            ) : null}

            {/* Delete Draft Option */}
            {canManage ? (
              <FieldGroup className="gap-3 p-3">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    {copy.deleteDraftTitle}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {copy.deleteDraftHint}
                  </p>
                </div>
                {deleteConfirmOpen ? (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-destructive font-medium">
                      {copy.deleteConfirm}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isPending}
                        onClick={handleDeleteDraft}
                      >
                        {copy.confirmDelete}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        {quickCopy.cancel}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs text-destructive"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      <IconTrash2 className="size-3.5 mr-1" />
                      {copy.deleteThisProfile}
                    </Button>
                  </div>
                )}
              </FieldGroup>
            ) : null}
          </div>
        ) : null}
      </div>
    </AppSheet>
  );
}
