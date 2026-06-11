"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
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
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { matchesSearch } from "@lib/search";
import { AppPageHeader } from "@/components/surface";
import {
  InventoryFilterBar,
  InventoryPageContent,
} from "../_components/inventory-page-layout";
import { InteractiveCard } from "../_components/interactive-card";
import { StatusBadge } from "../_components/status-badge";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import { deleteSupplier, fetchSuppliers } from "../procurement-actions";
import { SupplierDialog } from "./supplier-dialog";
import type { SupplierRow } from "./supplier-dialog";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
export type { SupplierRow } from "./supplier-dialog";

const avatarColors = [
  { bg: "bg-primary/10", fg: "text-primary" },
  { bg: "bg-success/12", fg: "text-success" },
  { bg: "bg-info/12", fg: "text-info" },
  { bg: "bg-destructive/12", fg: "text-destructive" },
  { bg: "bg-muted", fg: "text-muted-foreground" },
];

function SupplierAvatar({
  name,
  colorIndex,
}: {
  name: string;
  colorIndex: number;
}) {
  const color = avatarColors[colorIndex % avatarColors.length]!;
  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
        color.bg,
        color.fg,
      )}
    >
      {name
        .split(" ")
        .map((w) => w[0])
        .slice(0, 2)
        .join("")}
    </div>
  );
}

export function SuppliersClient({ initial }: { initial: SupplierRow[] }) {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((s) => matchesSearch([s.name, s.tax_code, s.phone], q));
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
      <InventoryPageContent width={isMobile ? "narrow" : "wide"}>
        <AppPageHeader
          title="Nhà cung cấp"
          actions={
            <Button type="button" onClick={openCreate}>
              <IconPlus className="size-4" />
              Thêm nhà cung cấp
            </Button>
          }
        />
        {/* IconSearch */}
        <InventoryFilterBar>
          <InputGroup className={cn("flex-1", isMobile && "h-12 basis-full")}>
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="text"
              placeholder="Tìm tên, mã số thuế, điện thoại..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              inputMode="search"
            />
          </InputGroup>
          <Badge variant="outline" className="rounded-full">
            {filtered.length}/{rows.length}
          </Badge>
        </InventoryFilterBar>

        {/* Desktop: Table / Mobile: Cards */}
        {isMobile ? (
          <div className="flex flex-col gap-2">
            {filtered.length === 0 ? (
              <Empty className="py-8">
                <EmptyHeader>
                  <EmptyTitle className="text-sm font-semibold">
                    {search.trim()
                      ? "Không tìm thấy nhà cung cấp phù hợp"
                      : "Chưa có nhà cung cấp nào"}
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              filtered.map((s, i) => (
                <InteractiveCard
                  key={s.id}
                  minHeight="mobile"
                  padding="default"
                  className="flex-col items-stretch gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <SupplierAvatar name={s.name} colorIndex={i} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.phone ?? "—"}
                        </p>
                      </div>
                    </div>
                    <StatusBadge
                      status={s.is_active ? "active" : "suspended"}
                      size="sm"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t pt-2">
                    <div className="flex gap-2 text-xs text-muted-foreground">
                      {s.tax_code && (
                        <span className="font-mono">MST: {s.tax_code}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(s)}
                        aria-label={`Sửa ${s.name}`}
                      >
                        <IconPencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteConfirmId(s.id)}
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Xóa ${s.name}`}
                      >
                        <IconTrash className="size-4" />
                      </Button>
                    </div>
                  </div>
                </InteractiveCard>
              ))
            )}
          </div>
        ) : (
          <Card>
            <CardContent flush>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nhà cung cấp</TableHead>
                    <TableHead>Mã số thuế</TableHead>
                    <TableHead>Điện thoại</TableHead>
                    <TableHead>Địa chỉ</TableHead>
                    <TableHead>{FORM_VI.status}</TableHead>
                    <TableHead className="w-24 text-right">
                      {FORM_VI.action}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={6}
                      title={
                        search.trim()
                          ? "Không tìm thấy nhà cung cấp phù hợp"
                          : "Chưa có nhà cung cấp"
                      }
                      description={
                        search.trim()
                          ? "Thử tên, mã số thuế hoặc số điện thoại khác."
                          : 'Nhấn "Thêm nhà cung cấp" để bắt đầu.'
                      }
                    />
                  )}
                  {filtered.map((s, i) => (
                    <TableRow key={s.id} className="group">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <SupplierAvatar name={s.name} colorIndex={i} />
                          <p className="text-sm font-semibold">{s.name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {s.tax_code ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {s.phone ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-44 truncate text-sm text-muted-foreground">
                        {s.address ?? "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={s.is_active ? "active" : "suspended"}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(s)}
                            aria-label={`Sửa ${s.name}`}
                          >
                            <IconPencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteConfirmId(s.id)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label={`Xóa ${s.name}`}
                          >
                            <IconTrash className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </InventoryPageContent>

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
            <AlertDialogCancel disabled={isPending}>
              {ACTIONS_VI.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirmId != null) handleDelete(deleteConfirmId);
              }}
            >
              {isPending ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
