"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PlusCircle, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Switch } from "@comtammatu/ui/components/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@comtammatu/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@comtammatu/ui/components/form";
import { Input } from "@comtammatu/ui/components/input";
import type { StaffRow, BranchOption } from "./actions";
import {
  inviteStaff,
  updateStaff,
  toggleStaffActive,
} from "./actions";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ sở hữu",
  super_manager: "Quản lý cấp cao",
  area_manager: "Quản lý khu vực",
  branch_manager: "Quản lý chi nhánh",
  cashier: "Thu ngân",
  waiter: "Phục vụ",
  chef: "Đầu bếp",
  office: "Văn phòng",
};

const ROLE_BADGE_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  owner: "default",
  super_manager: "default",
  area_manager: "secondary",
  branch_manager: "secondary",
  cashier: "outline",
  waiter: "outline",
  chef: "outline",
  office: "outline",
};

const ALL_ROLES = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
  "waiter",
  "chef",
  "office",
] as const;

const BRANCH_REQUIRED_ROLES = new Set([
  "branch_manager",
  "cashier",
  "waiter",
  "chef",
]);

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const inviteSchema = z.object({
  full_name: z.string().min(1, "Vui lòng nhập họ tên"),
  email: z.email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự"),
  role: z.enum(ALL_ROLES),
  branch_id: z.string().nullable(),
});

const editSchema = z.object({
  role: z.enum(ALL_ROLES),
  branch_id: z.string().nullable(),
  is_active: z.boolean(),
});

type InviteFormValues = z.infer<typeof inviteSchema>;
type EditFormValues = z.infer<typeof editSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StaffListProps {
  staff: StaffRow[];
  branches: BranchOption[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StaffList({ staff: initialStaff, branches }: StaffListProps) {
  const [staff, setStaff] = useState(initialStaff);
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffRow | null>(null);
  const [isPending, startTransition] = useTransition();

  // Filtered list
  const filtered = staff.filter((s) => {
    if (filterRole !== "all" && s.role !== filterRole) return false;
    if (filterBranch !== "all") {
      if (filterBranch === "none") return s.branch_id === null;
      if (s.branch_id !== Number(filterBranch)) return false;
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Invite form
  // ---------------------------------------------------------------------------

  const inviteForm = useForm<InviteFormValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      role: "cashier",
      branch_id: null,
    },
  });

  const watchedInviteRole = inviteForm.watch("role");

  function handleInviteSubmit(values: InviteFormValues) {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("full_name", values.full_name);
      fd.set("email", values.email);
      fd.set("password", values.password);
      fd.set("role", values.role);
      if (values.branch_id) fd.set("branch_id", values.branch_id);

      const result = await inviteStaff(fd);
      if (result.success) {
        toast.success("Đã thêm nhân viên thành công");
        setInviteOpen(false);
        inviteForm.reset();
      } else {
        toast.error(result.error ?? "Thêm nhân viên thất bại");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Edit form
  // ---------------------------------------------------------------------------

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { role: "cashier", branch_id: null, is_active: true },
  });

  const watchedEditRole = editForm.watch("role");

  function openEdit(member: StaffRow) {
    setEditTarget(member);
    editForm.reset({
      role: member.role,
      branch_id: member.branch_id ? String(member.branch_id) : null,
      is_active: member.is_active,
    });
  }

  function handleEditSubmit(values: EditFormValues) {
    if (!editTarget) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", editTarget.id);
      fd.set("role", values.role);
      if (values.branch_id) fd.set("branch_id", values.branch_id);
      fd.set("is_active", String(values.is_active));

      const result = await updateStaff(fd);
      if (result.success) {
        toast.success("Đã cập nhật nhân viên");
        setStaff((prev) =>
          prev.map((s) =>
            s.id === editTarget.id
              ? {
                  ...s,
                  role: values.role,
                  branch_id: values.branch_id ? Number(values.branch_id) : null,
                  branch_name:
                    branches.find(
                      (b) => b.id === Number(values.branch_id),
                    )?.name ?? null,
                  is_active: values.is_active,
                }
              : s,
          ),
        );
        setEditTarget(null);
      } else {
        toast.error(result.error ?? "Cập nhật thất bại");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Toggle active
  // ---------------------------------------------------------------------------

  function handleToggleActive(member: StaffRow, checked: boolean) {
    startTransition(async () => {
      const result = await toggleStaffActive(member.id, checked);
      if (result.success) {
        setStaff((prev) =>
          prev.map((s) =>
            s.id === member.id ? { ...s, is_active: checked } : s,
          ),
        );
        toast.success(
          checked ? "Đã kích hoạt tài khoản" : "Đã vô hiệu hoá tài khoản",
        );
      } else {
        toast.error(result.error ?? "Cập nhật trạng thái thất bại");
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc theo vai trò" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả vai trò</SelectItem>
            {ALL_ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterBranch} onValueChange={setFilterBranch}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Lọc theo chi nhánh" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả chi nhánh</SelectItem>
            <SelectItem value="none">Không có chi nhánh</SelectItem>
            {branches.map((b) => (
              <SelectItem key={b.id} value={String(b.id)}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button onClick={() => setInviteOpen(true)}>
            <PlusCircle className="mr-2 size-4" />
            Thêm nhân viên
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Họ tên</TableHead>
              <TableHead>Vai trò</TableHead>
              <TableHead>Chi nhánh</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-12 text-center text-muted-foreground"
                >
                  Không có nhân viên nào
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.full_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={ROLE_BADGE_VARIANT[member.role] ?? "outline"}>
                      {ROLE_LABELS[member.role] ?? member.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.branch_name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={member.is_active}
                      disabled={isPending}
                      onCheckedChange={(checked) =>
                        handleToggleActive(member, checked)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(member)}
                    >
                      <Pencil className="size-4" />
                      <span className="sr-only">Sửa</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm nhân viên</DialogTitle>
          </DialogHeader>
          <Form {...inviteForm}>
            <form
              onSubmit={inviteForm.handleSubmit(handleInviteSubmit)}
              className="space-y-4"
            >
              <FormField
                control={inviteForm.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Họ tên</FormLabel>
                    <FormControl>
                      <Input placeholder="Nguyễn Văn A" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="nhanvien@example.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mật khẩu tạm</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={inviteForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vai trò</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {BRANCH_REQUIRED_ROLES.has(watchedInviteRole) && (
                <FormField
                  control={inviteForm.control}
                  name="branch_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chi nhánh</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v === "" ? null : v)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn chi nhánh" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setInviteOpen(false)}
                >
                  Huỷ
                </Button>
                <Button type="submit" disabled={isPending}>
                  Thêm nhân viên
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Sửa nhân viên — {editTarget?.full_name ?? ""}
            </DialogTitle>
          </DialogHeader>
          <Form {...editForm}>
            <form
              onSubmit={editForm.handleSubmit(handleEditSubmit)}
              className="space-y-4"
            >
              <FormField
                control={editForm.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vai trò</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ALL_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {BRANCH_REQUIRED_ROLES.has(watchedEditRole) && (
                <FormField
                  control={editForm.control}
                  name="branch_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chi nhánh</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) =>
                          field.onChange(v === "" ? null : v)
                        }
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Chọn chi nhánh" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={editForm.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-3">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Đang hoạt động</FormLabel>
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditTarget(null)}
                >
                  Huỷ
                </Button>
                <Button type="submit" disabled={isPending}>
                  Lưu thay đổi
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
