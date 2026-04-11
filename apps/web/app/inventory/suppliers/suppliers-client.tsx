"use client";

import { useMemo, useState, useTransition } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { StatusBadge } from "../_components/shared";
import { deleteSupplier, fetchSuppliers } from "../procurement-actions";
import { SupplierDialog } from "./supplier-dialog";
import type { SupplierRow } from "./supplier-dialog";

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

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

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

  const active = rows.filter((s) => s.is_active).length;
  const suspended = rows.filter((s) => !s.is_active).length;
  const deleteTarget = rows.find((r) => r.id === deleteConfirmId);

  async function reload() {
    const res = await fetchSuppliers();
    if (res.success) setRows((res.data ?? []) as SupplierRow[]);
  }

  function openCreate() {
    setEditingSupplier(null);
    setDialogOpen(true);
  }

  function openEdit(row: SupplierRow) {
    setEditingSupplier(row);
    setDialogOpen(true);
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-2xl font-bold tracking-tight"
            style={{ color: "var(--md-on-surface)" }}
          >
            Danh sách Nhà cung cấp
          </h2>
          <p
            className="mt-2 max-w-lg text-sm"
            style={{ color: "var(--md-on-surface-variant)" }}
          >
            Quản lý thông tin liên hệ và điều khoản thanh toán của các đối tác
            cung ứng trong hệ thống.
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
          <Plus className="size-4" />
          Thêm nhà cung cấp
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
            value: String(active).padStart(2, "0"),
            valueColor: "var(--md-secondary)",
          },
          {
            icon: <Pause className="size-5" />,
            iconBg: "var(--md-surface-highest)",
            iconColor: "var(--md-on-surface-variant)",
            label: "Tạm ngưng",
            value: String(suspended).padStart(2, "0"),
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
              <span
                className="whitespace-nowrap text-label font-semibold uppercase tracking-wide"
                style={{ color: "var(--md-outline-variant)" }}
              >
                Hệ thống
              </span>
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

      {/* Data Table */}
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
          className="flex items-center gap-3 border-b px-6 py-4"
          style={{
            borderColor:
              "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
          }}
        >
          <Search
            className="size-4 shrink-0"
            style={{ color: "var(--md-outline)" }}
          />
          <input
            type="text"
            placeholder="Tìm tên, mã số thuế, điện thoại…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm outline-none"
            style={{ color: "var(--md-on-surface)" }}
          />
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: "var(--md-outline)" }}
          >
            {filtered.length} / {rows.length}
          </span>
        </div>

        <Table>
          <TableHeader>
            <TableRow
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
              }}
            >
              {[
                "Nhà cung cấp",
                "Mã số thuế",
                "Điện thoại",
                "Địa chỉ",
                "Trạng thái",
                "Thao tác",
              ].map((h) => (
                <TableHead
                  key={h}
                  className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider ${h === "Trạng thái" ? "text-center" : ""} ${h === "Thao tác" ? "text-right" : ""}`}
                  style={{ color: "var(--md-outline)" }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-16 text-center text-sm"
                  style={{ color: "var(--md-on-surface-variant)" }}
                >
                  {search
                    ? "Không tìm thấy nhà cung cấp nào"
                    : 'Chưa có nhà cung cấp. Nhấn "Thêm nhà cung cấp" để bắt đầu.'}
                </TableCell>
              </TableRow>
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
                      <div>
                        <p className="text-sm font-semibold">{s.name}</p>
                      </div>
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
                  <TableCell
                    className="max-w-44 truncate px-6 py-5 text-sm"
                    style={{ color: "var(--md-on-surface-variant)" }}
                  >
                    {s.address ?? "—"}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-center">
                    <StatusBadge
                      status={s.is_active ? "active" : "suspended"}
                    />
                  </TableCell>
                  <TableCell className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="rounded-full p-1.5 transition-colors hover:opacity-80"
                        style={{ color: "var(--md-on-surface-variant)" }}
                        aria-label={`Sửa ${s.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(s.id)}
                        className="rounded-full p-1.5 transition-colors hover:opacity-80"
                        style={{ color: "var(--md-error)" }}
                        aria-label={`Xóa ${s.name}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
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
            Hiển thị {filtered.length} nhà cung cấp
          </span>
          <div className="flex items-center gap-2">
            <span
              className="flex size-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: "var(--md-primary)" }}
            >
              1
            </span>
          </div>
        </div>
      </div>

      {/* Create / Edit Dialog */}
      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
        onSaved={reload}
      />

      {/* Delete Confirmation */}
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
              Xóa nhà cung cấp &ldquo;{deleteTarget?.name}&rdquo;? Hành động này
              không thể hoàn tác.
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
    </div>
  );
}
