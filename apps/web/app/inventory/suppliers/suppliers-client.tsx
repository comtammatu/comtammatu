"use client";

import { useMemo, useState, useTransition } from "react";
import { SectionCard } from "@comtammatu/ui/components/inventory-patterns";
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
import { cn } from "@comtammatu/ui";
import { FilterBar, PageHeader, StatusBadge } from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { deleteSupplier, fetchSuppliers } from "../procurement-actions";
import { SupplierDialog } from "./supplier-dialog";
import type { SupplierRow } from "./supplier-dialog";

export type { SupplierRow } from "./supplier-dialog";

// Color palette for supplier avatars
const avatarColors = [
  { bg: "bg-primary/10", fg: "text-primary" },
  { bg: "bg-success/12", fg: "text-success" },
  { bg: "bg-info/12", fg: "text-info" },
  { bg: "bg-destructive/12", fg: "text-destructive" },
  { bg: "bg-muted", fg: "text-muted-foreground" },
];

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const panelClassName = "rounded-lg border bg-card shadow-sm";
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
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <PageHeader
          title="Danh sách Nhà cung cấp"
          description="Đối tác cung ứng."
        />
        <button
          type="button"
          onClick={openCreate}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background flex min-h-11 items-center gap-2 rounded-full bg-primary px-6 py-2.5 font-bold text-primary-foreground shadow-lg transition-transform hover:scale-[1.02]"
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
            iconBg: "bg-info/12",
            iconColor: "text-info",
            label: "Tổng đối tác",
            value: String(rows.length).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-5" />,
            iconBg: "bg-success/12",
            iconColor: "text-success",
            label: "Đang hoạt động",
            value: String(active).padStart(2, "0"),
            valueClassName: "text-success",
          },
          {
            icon: <Pause className="size-5" />,
            iconBg: "bg-muted",
            iconColor: "text-muted-foreground",
            label: "Tạm ngưng",
            value: String(suspended).padStart(2, "0"),
          },
        ].map((card) => (
          <SectionCard
            key={card.label}
            className={cn(panelClassName, "rounded-lg bg-card")}
            density="comfortable"
          >
            <div className="mb-4 flex items-start justify-between">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl",
                  card.iconBg,
                  card.iconColor,
                )}
              >
                {card.icon}
              </div>
              <span className="whitespace-nowrap text-label font-semibold uppercase tracking-wide text-muted-foreground">
                Hệ thống
              </span>
            </div>
            <h3
              className={cn(
                "text-3xl font-black tracking-tight",
                card.valueClassName,
              )}
            >
              {card.value}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{card.label}</p>
          </SectionCard>
        ))}
      </div>

      {/* Data Table */}
      <div
        className={cn(panelClassName, "overflow-hidden rounded-xl bg-card")}
      >
        {/* Search bar */}
        <FilterBar
          className="rounded-none border-0 border-b border-border px-6 py-4 shadow-none"
          surface="inventory"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Tìm tên, mã số thuế, điện thoại…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </FilterBar>

        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
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
                  className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground ${h === "Trạng thái" ? "text-center" : ""} ${h === "Thao tác" ? "text-right" : ""}`}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableEmptyStateRow
                colSpan={6}
                paddingClassName="py-16"
                title={
                  search
                    ? "Không tìm thấy nhà cung cấp nào"
                    : "Chưa có nhà cung cấp"
                }
                description={
                  search
                    ? "Thử tên, mã số thuế hoặc số điện thoại khác."
                    : 'Nhấn "Thêm nhà cung cấp" để bắt đầu.'
                }
              />
            )}
            {filtered.map((s, i) => {
              const color = avatarColors[i % avatarColors.length]!;
              return (
                <TableRow
                  key={s.id}
                  className="group border-border transition-colors"
                >
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full text-xs font-bold",
                          color.bg,
                          color.fg,
                        )}
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
                  <TableCell className="px-6 py-5 font-mono text-sm text-muted-foreground">
                    {s.tax_code ?? "—"}
                  </TableCell>
                  <TableCell className="px-6 py-5 font-mono text-sm">
                    {s.phone ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-44 truncate px-6 py-5 text-sm text-muted-foreground">
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
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Sửa ${s.name}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmId(s.id)}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full p-1.5 text-destructive transition-colors hover:bg-destructive/10"
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
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <span className="text-xs font-medium text-muted-foreground">
            Hiển thị {filtered.length} nhà cung cấp
          </span>
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
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
