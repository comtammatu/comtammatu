"use client";

/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: HR operational copy inline */

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
      ?.label ?? "Chưa ghi nhận";

  function handleResetPassword() {
    if (!employee) return;
    if (newPassword.trim().length < 8) {
      toast.error("Mật khẩu mới phải có ít nhất 8 ký tự.");
      return;
    }
    startTransition(async () => {
      const res = await resetEmployeePassword({
        employeeId: employee.id,
        newPassword: newPassword.trim(),
      });
      if (!res.success) {
        toast.error(res.error ?? "Không thể đặt lại mật khẩu.");
        return;
      }
      toast.success("Đã đặt lại mật khẩu mới cho nhân viên.");
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
        toast.error(res.error ?? "Không thể cập nhật trạng thái đăng nhập.");
        return;
      }
      toast.success(
        !isLoginActive
          ? "Đã kích hoạt quyền đăng nhập hệ thống."
          : "Đã tạm khóa quyền đăng nhập hệ thống.",
      );
      router.refresh();
    });
  }

  function handleDeleteDraft() {
    if (!employee) return;
    startTransition(async () => {
      const res = await deleteDraftEmployee({ employeeId: employee.id });
      if (!res.success) {
        toast.error(res.error ?? "Không thể xóa hồ sơ.");
        return;
      }
      toast.success("Đã xóa hồ sơ nhân viên thành công.");
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
              {profile?.full_name ?? "Hồ sơ nhân viên"}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              {[
                employee.employee_code ?? `NV#${employee.id}`,
                profile?.positions?.label_vi ?? "Chưa gán chức vụ",
                profile?.branches?.name ?? "Văn phòng công ty",
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
              Sửa hồ sơ
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
              Đổi ca hôm nay
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
              Cho thôi việc
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
            Hồ sơ & Vị trí
          </Button>
          <Button
            type="button"
            variant={activeTab === "tasks" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("tasks")}
          >
            Ca làm & Việc ({activeTasks.length})
          </Button>
          <Button
            type="button"
            variant={activeTab === "compensation" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("compensation")}
          >
            Lương & HĐLĐ
          </Button>
          <Button
            type="button"
            variant={activeTab === "account" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setActiveTab("account")}
          >
            Tài khoản & Quyền
          </Button>
        </div>

        {/* Tab 1: Profile & Placement */}
        {activeTab === "profile" ? (
          <div className="flex flex-col gap-4">
            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  Thông tin công việc
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Chức vụ:</span>
                  <p className="font-medium mt-1">
                    {profile?.positions?.label_vi ?? "Chưa gán chức vụ"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Nơi làm việc:</span>
                  <p className="font-medium mt-1">
                    {profile?.branches?.name ?? "Văn phòng công ty"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Mã nhân viên:</span>
                  <p className="font-medium mt-1">
                    {employee.employee_code || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày bắt đầu:</span>
                  <p className="font-medium mt-1">
                    {employee.start_date || "—"}
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  Liên hệ & Thanh toán
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Số điện thoại:</span>
                  <p className="font-medium mt-1">
                    {profile?.phone || "Chưa có"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">CMND / CCCD:</span>
                  <p className="font-medium mt-1">
                    {employee.id_number || "—"}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">
                    Số tài khoản ngân hàng:
                  </span>
                  <p className="font-medium mt-1">
                    {employee.bank_account
                      ? `${employee.bank_account} ${employee.bank_name ? `(${employee.bank_name})` : ""}`
                      : "Chưa ghi nhận"}
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
                  Ca làm hôm nay
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
                    Đổi ca
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
                      : "Chưa phân ca hôm nay"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {shift
                      ? "Nhân viên có thể chấm công vào khung giờ này"
                      : "Gán ca để nhân viên có thể chấm công vào hệ thống"}
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="font-heading text-sm font-semibold">
                    Việc trong ca ({activeTasks.length})
                  </p>
                  <Badge variant={hasOverride ? "default" : "secondary"}>
                    {hasOverride ? "Mẫu riêng" : "Theo chức vụ"}
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
                      {hasOverride ? "Sửa mẫu riêng" : "Tạo mẫu riêng"}
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
                        Dùng lại chức vụ
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
                          <Badge variant="outline">Bắt buộc</Badge>
                        ) : null}
                      </div>
                      <span className="text-muted-foreground">
                        {task.phase === "start_of_shift"
                          ? "Đầu ca"
                          : task.phase === "end_of_shift"
                            ? "Cuối ca"
                            : "Trong ca"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs italic text-muted-foreground">
                  Chưa có danh sách việc mẫu cho chức vụ này.
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
                  Chế độ lương & Đãi ngộ
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Đơn vị tính lương:</span>
                  <p className="font-medium mt-1">
                    {activeContract?.wage_unit === "daily"
                      ? "Lương ngày (theo công)"
                      : "Lương tháng"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chế độ lương:</span>
                  <p className="font-medium mt-1">
                    {activeContract?.pay_basis === "fixed_monthly"
                      ? "Lương tháng cố định"
                      : "Theo ngày công thực tế"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {activeContract?.wage_unit === "daily"
                      ? "Mức lương ngày:"
                      : "Lương cơ bản:"}
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
                  <span className="text-muted-foreground">Lương đóng BHXH:</span>
                  <p className="font-medium mt-1">
                    {(employee.insurance_base_salary ?? 0) > 0
                      ? formatVND(employee.insurance_base_salary ?? 0)
                      : "Chưa tham gia BHXH"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Người phụ thuộc:</span>
                  <p className="font-medium mt-1">
                    {employee.dependents_count} người (giảm trừ thuế TNCN)
                  </p>
                </div>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex flex-col gap-1">
                <p className="font-heading text-sm font-semibold">
                  Hợp đồng lao động
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-muted-foreground">Loại hợp đồng:</span>
                  <p className="font-medium mt-1">{contractLabel}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Số hợp đồng:</span>
                  <p className="font-medium mt-1">
                    {activeContract?.contract_number || "Chưa ghi nhận"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày ký:</span>
                  <p className="font-medium mt-1">
                    {activeContract?.signed_date || "—"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Ngày hết hạn:</span>
                  <p className="font-medium mt-1">
                    {activeContract?.end_date || "Không xác định"}
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
                    Trạng thái đăng nhập
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Quyền truy cập ứng dụng POS, KDS và chấm công.
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
                        Khóa đăng nhập
                      </>
                    ) : (
                      <>
                        <IconUnlock className="size-3.5" />
                        Mở khóa đăng nhập
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Trạng thái:</span>
                <Badge variant={isLoginActive ? "default" : "destructive"}>
                  {isLoginActive ? "Đang cho phép đăng nhập" : "Đang bị khóa"}
                </Badge>
              </div>
            </FieldGroup>

            <FieldGroup className="gap-3 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    Mật khẩu đăng nhập
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Đặt lại mật khẩu cho nhân viên nếu quên.
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
                    Đặt lại mật khẩu
                  </Button>
                ) : null}
              </div>
              {showPasswordInput ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="password"
                    placeholder="Mật khẩu mới (ít nhất 8 ký tự)"
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
                    Lưu mật khẩu
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
                    Hủy
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Mật khẩu được mã hóa an toàn và chỉ có thể đặt lại mới.
                </p>
              )}
            </FieldGroup>

            {profile?.id ? (
              <FieldGroup className="gap-3 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-sm font-semibold">
                      Phân quyền hệ thống
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Xem chi tiết ma trận quyền và điều chỉnh ngoại lệ.
                    </p>
                  </div>
                  <Link
                    href={`/hr/staff/${profile.id}/permissions`}
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                  >
                    <IconShield className="size-3.5" />
                    Mở bảng phân quyền
                  </Link>
                </div>
              </FieldGroup>
            ) : null}

            {/* Delete Draft Option */}
            {canManage ? (
              <FieldGroup className="gap-3 p-3">
                <div>
                  <p className="font-heading text-sm font-semibold">
                    Xóa hồ sơ nháp
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Chỉ dùng cho trường hợp tạo nhầm hồ sơ và chưa phát sinh chấm công hay bảng lương.
                  </p>
                </div>
                {deleteConfirmOpen ? (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-destructive font-medium">
                      Bạn có chắc chắn muốn xóa dứt điểm nhân viên này?
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-8 text-xs"
                        disabled={isPending}
                        onClick={handleDeleteDraft}
                      >
                        Xác nhận xóa
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setDeleteConfirmOpen(false)}
                      >
                        Hủy
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
                      Xóa hồ sơ này
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
