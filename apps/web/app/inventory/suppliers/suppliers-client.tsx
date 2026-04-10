"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle,
  Pause,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Button } from "@comtammatu/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  createSupplier,
  deleteSupplier,
  fetchSuppliers,
  updateSupplier,
} from "../procurement-actions";
import { TableEmptyStateRow } from "../../admin/components/table-empty-state-row";
import { StatusBadge } from "../_components/shared";

// Color palette for supplier avatars
const avatarColors = [
  { bg: "var(--md-primary-fixed)", fg: "var(--md-primary)" },
  { bg: "var(--md-secondary-container)", fg: "var(--md-secondary)" },
  {
    bg: "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
    fg: "var(--md-tertiary)",
  },
  { bg: "var(--md-error-container)", fg: "var(--md-error)" },
  { bg: "var(--md-surface-high)", fg: "var(--md-on-surface-variant)" },
];

export interface SupplierRow {
  id: number;
  name: string;
  tax_code: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
}

type DialogMode = "create" | "edit";

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<DialogMode>("create");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<SupplierRow | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.tax_code ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const deleteTarget = rows.find((r) => r.id === deleteConfirmId);

  async function reload() {
    const again = await fetchSuppliers();
    if (again.success) setRows((again.data ?? []) as SupplierRow[]);
  }

  function openCreate() {
    setMode("create");
    setEditingId(null);
    setEditingRow(null);
    setOpen(true);
  }

  function openEdit(row: SupplierRow) {
    setMode("edit");
    setEditingId(row.id);
    setEditingRow(row);
    setOpen(true);
  }

  function handleSubmit(fd: FormData) {
    const name = String(fd.get("name") ?? "").trim();
    if (!name) {
      toast.error("Nhập tên NCC");
      return;
    }
    const payload = {
      name,
      tax_code: String(fd.get("tax_code") ?? "") || undefined,
      phone: String(fd.get("phone") ?? "") || undefined,
      address: String(fd.get("address") ?? "") || undefined,
      notes: String(fd.get("notes") ?? "") || undefined,
    };

    startTransition(async () => {
      if (mode === "edit" && editingId != null) {
        const res = await updateSupplier(editingId, payload);
        if (!res.success) {
          toast.error(res.error ?? "Không cập nhật được");
          return;
        }
        toast.success("Đã cập nhật nhà cung cấp");
      } else {
        const res = await createSupplier(payload);
        if (!res.success) {
          toast.error(res.error ?? "Không tạo được");
          return;
        }
        toast.success("Đã tạo nhà cung cấp");
      }
      setOpen(false);
      await reload();
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      const res = await deleteSupplier(id);
      if (!res.success) {
        toast.error(res.error ?? "Không xóa được");
        setDeleteConfirmId(null);
        return;
      }
      toast.success("Đã xóa nhà cung cấp");
      setDeleteConfirmId(null);
      await reload();
    });
  }

  const activeCount = rows.filter((r) => r.is_active).length;
  const suspendedCount = rows.filter((r) => !r.is_active).length;

  return (
    <>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Nhà cung cấp
          </h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--md-on-surface-variant)", opacity: 0.7 }}
          >
            Chỉ dùng cho nhập hàng tại{" "}
            <Link href="/admin/settings/branches" className="underline">
              Trụ sở
            </Link>
            . Chi nhánh không đặt NCC trực tiếp.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 rounded-full px-6 py-2.5 font-bold text-white shadow-xl transition-transform hover:scale-[1.02]"
          style={{
            background:
              "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            boxShadow: "0 4px 14px rgba(211,84,0,0.15)",
          }}
        >
          <Plus className="size-4" /> Thêm NCC
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            icon: <Users className="size-5" />,
            iconBg: "color-mix(in srgb, var(--md-tertiary) 15%, transparent)",
            iconColor: "var(--md-tertiary)",
            label: "Tổng đối tác",
            value: String(rows.length).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-5" />,
            iconBg: "var(--md-secondary-container)",
            iconColor: "var(--md-secondary)",
            label: "Đang hoạt động",
            value: String(activeCount).padStart(2, "0"),
            valueColor: "var(--md-secondary)",
          },
          {
            icon: <Pause className="size-5" />,
            iconBg: "var(--md-surface-highest)",
            iconColor: "var(--md-on-surface-variant)",
            label: "Tạm ngưng",
            value: String(suspendedCount).padStart(2, "0"),
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-6 ambient-shadow"
            style={{
              backgroundColor: "var(--md-surface-lowest)",
              border:
                "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
            }}
          >
            <div className="mb-4 flex items-start justify-between">
              <div
                className="flex size-10 items-center justify-center rounded-xl"
                style={{
                  backgroundColor: card.iconBg,
                  color: card.iconColor,
                }}
              >
                {card.icon}
              </div>
            </div>
            <h3
              className="text-3xl font-black tracking-tight"
              style={{ color: card.valueColor }}
            >
              {card.value}
            </h3>
            <p
              className="mt-1 text-sm"
              style={{ color: "var(--md-on-surface-variant)" }}
            >
              {card.label}
            </p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div
        className="overflow-hidden rounded-3xl ambient-shadow"
        style={{
          backgroundColor: "var(--md-surface-lowest)",
          border:
            "1px solid color-mix(in srgb, var(--md-outline-variant) 5%, transparent)",
        }}
      >
        {/* Search bar */}
        <div
          className="flex items-center gap-3 border-b px-4 py-3"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <Search
            className="size-4 shrink-0"
            style={{ color: "var(--md-outline)" }}
          />
          <Input
            placeholder="Tìm tên, mã số thuế, điện thoại…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
          />
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            {filtered.length} / {rows.length}
          </span>
        </div>

        {/* Mobile: card layout */}
        {isMobile ? (
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {search
                    ? "Không tìm thấy nhà cung cấp nào"
                    : "Chưa có nhà cung cấp"}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{
                    color: "var(--md-on-surface-variant)",
                    opacity: 0.7,
                  }}
                >
                  {search
                    ? "Thử từ khóa khác"
                    : 'Nhấn "Thêm NCC" để thêm nhà cung cấp đầu tiên'}
                </p>
              </div>
            )}
            {filtered.map((s, i) => {
              const color = avatarColors[i % avatarColors.length]!;
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: color.bg,
                        color: color.fg,
                      }}
                    >
                      {s.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p
                        className="truncate text-xs"
                        style={{ color: "var(--md-on-surface-variant)" }}
                      >
                        {s.tax_code && <>{s.tax_code}</>}
                        {s.tax_code && s.phone && " · "}
                        {s.phone && <>{s.phone}</>}
                        {!s.tax_code && !s.phone && "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge
                      status={s.is_active ? "active" : "suspended"}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Sửa ${s.name}`}
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      aria-label={`Xóa ${s.name}`}
                      onClick={() => setDeleteConfirmId(s.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Desktop: table layout */
          <Table>
            <TableHeader>
              <TableRow
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                }}
              >
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Tên
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Mã số thuế
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Điện thoại
                </TableHead>
                <TableHead
                  className="px-6 py-5 text-center text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Trạng thái
                </TableHead>
                <TableHead
                  className="w-24 px-6 py-5 text-right text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--md-outline)" }}
                >
                  Thao tác
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableEmptyStateRow
                  colSpan={5}
                  paddingClassName="py-16"
                  title={
                    search
                      ? "Không tìm thấy nhà cung cấp nào"
                      : "Chưa có nhà cung cấp"
                  }
                  description={
                    search
                      ? "Thử từ khóa khác"
                      : 'Nhấn "Thêm NCC" để thêm nhà cung cấp đầu tiên'
                  }
                />
              )}
              {filtered.map((s, i) => {
                const color = avatarColors[i % avatarColors.length]!;
                return (
                  <TableRow
                    key={s.id}
                    className="group transition-colors"
                    style={{
                      borderColor:
                        "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                    }}
                  >
                    <TableCell className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex size-9 items-center justify-center rounded-full text-xs font-bold"
                          style={{
                            backgroundColor: color.bg,
                            color: color.fg,
                          }}
                        >
                          {s.name
                            .split(" ")
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")}
                        </div>
                        <span className="text-sm font-semibold">{s.name}</span>
                      </div>
                    </TableCell>
                    <TableCell
                      className="px-6 py-5 font-mono text-sm"
                      style={{ color: "var(--md-on-surface-variant)" }}
                    >
                      {s.tax_code ?? "—"}
                    </TableCell>
                    <TableCell className="px-6 py-5 font-mono text-sm">
                      {s.phone ?? "—"}
                    </TableCell>
                    <TableCell className="px-6 py-5 text-center">
                      <StatusBadge
                        status={s.is_active ? "active" : "suspended"}
                      />
                    </TableCell>
                    <TableCell className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Sửa ${s.name}`}
                          onClick={() => openEdit(s)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive hover:text-destructive"
                          aria-label={`Xóa ${s.name}`}
                          onClick={() => setDeleteConfirmId(s.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        {/* Pagination footer */}
        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <span
            className="text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            Hiển thị {filtered.length} / {rows.length} nhà cung cấp
          </span>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {mode === "edit" ? "Sửa nhà cung cấp" : "Thêm nhà cung cấp"}
            </DialogTitle>
            <DialogDescription>
              {mode === "edit"
                ? "Cập nhật thông tin nhà cung cấp."
                : "Nhập thông tin nhà cung cấp mới."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Tên *</Label>
              <Input
                id="name"
                name="name"
                required
                autoFocus
                defaultValue={editingRow?.name ?? ""}
                key={editingId ?? "new"}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tax_code">Mã số thuế</Label>
              <Input
                id="tax_code"
                name="tax_code"
                defaultValue={editingRow?.tax_code ?? ""}
                key={`tax-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Điện thoại</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={editingRow?.phone ?? ""}
                key={`phone-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                id="address"
                name="address"
                defaultValue={editingRow?.address ?? ""}
                key={`addr-${editingId ?? "new"}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Ghi chú</Label>
              <Input
                id="notes"
                name="notes"
                defaultValue={editingRow?.notes ?? ""}
                key={`notes-${editingId ?? "new"}`}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Đang lưu…" : mode === "edit" ? "Cập nhật" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation — AlertDialog */}
      <AlertDialog
        open={deleteConfirmId != null}
        onOpenChange={(o) => {
          if (!o) setDeleteConfirmId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Xóa NCC &ldquo;{deleteTarget?.name}&rdquo;? Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId != null) handleDelete(deleteConfirmId);
              }}
            >
              {isPending ? "Đang xóa…" : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
