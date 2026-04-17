"use client";

import { useMemo, useState, useTransition } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
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
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";
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
    <>
      <InventoryHeader
        title="Nhà cung cấp"
        actions={
          <Button
            type="button"
            onClick={openCreate}
          >
            <Plus className="size-4" />
            Them nha cung cap
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

      {/* Search */}
      <Card className="py-0"><CardContent className="flex flex-wrap items-center gap-3 p-3">
        <InputGroup className="h-10 flex-1">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="text"
            placeholder="Tìm tên, mã số thuế, điện thoại..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
        <Badge variant="outline" className="rounded-full">
          {filtered.length} / {rows.length}
        </Badge>
      </CardContent></Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
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
                      <Badge
                        variant={getInventoryStatusBadgeVariant(
                          s.is_active ? "active" : "suspended",
                        )}
                      >
                        {getInventoryStatusLabel(
                          s.is_active ? "active" : "suspended",
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEdit(s)}
                          aria-label={`Sửa ${s.name}`}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteConfirmId(s.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label={`Xóa ${s.name}`}
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

        </CardContent>
      </Card>

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
    </div>
    </>
  );
}
