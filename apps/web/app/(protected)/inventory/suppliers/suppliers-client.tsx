"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  PackageSearch as IconPackageSearch,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { StatusBadge } from "@/components/status-badge";
import { deleteSupplier, fetchSuppliers } from "../procurement-actions";
import { SupplierDialog } from "./supplier-dialog";
import type { SupplierRow } from "./supplier-dialog";

import { ACTIONS_VI, FORM_VI } from "@comtammatu/shared/messages";
export type { SupplierRow } from "./supplier-dialog";

const suppliersCopy = messages.inventory.suppliers;

const avatarColors = [
  { bg: "bg-primary/10", fg: "text-primary" },
  { bg: "bg-success/10", fg: "text-success" },
  { bg: "bg-info/10", fg: "text-info" },
  { bg: "bg-destructive/10", fg: "text-destructive" },
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

function SupplierMobileCard({
  supplier,
  index,
  onEdit,
  onDelete,
  canManageItems,
}: {
  supplier: SupplierRow;
  index: number;
  onEdit: (row: SupplierRow) => void;
  onDelete: (row: SupplierRow) => void;
  canManageItems: boolean;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <SupplierAvatar name={supplier.name} colorIndex={index} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{supplier.name}</p>
            <p className="text-xs text-muted-foreground">
              {supplier.phone ?? "—"}
            </p>
          </div>
        </div>
        <StatusBadge
          domain="inventory"
          value={supplier.is_active ? "active" : "suspended"}
          size="sm"
        />
      </div>
      <div className="flex items-center justify-between border-t pt-2">
        <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
          {supplier.tax_code && (
            <span className="font-mono">MST: {supplier.tax_code}</span>
          )}
          {supplier.address && (
            <span className="truncate">{supplier.address}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {canManageItems ? (
            <Button
              variant="ghost"
              size="icon-touch"
              render={
                <Link href={`/inventory/suppliers/${supplier.id}/items`} />
              }
              aria-label={suppliersCopy.items.openAria(supplier.name)}
            >
              <IconPackageSearch className="size-4" />
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(supplier)}
            aria-label={`Sửa ${supplier.name}`}
          >
            <IconPencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onDelete(supplier)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Xóa ${supplier.name}`}
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      </div>
    </InteractiveCard>
  );
}

export function SuppliersClient({
  initial,
  canManageItems,
}: {
  initial: SupplierRow[];
  canManageItems: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((s) => matchesSearch([s.name, s.tax_code, s.phone], q));
  }, [rows, search]);

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
        toast.error(res.error ?? suppliersCopy.deleteFailed);
        return;
      }
      toast.success(suppliersCopy.deleteOk);
      await reload();
    });
  }

  async function confirmDelete(supplier: SupplierRow) {
    const ok = await confirm({
      title: suppliersCopy.deleteTitle,
      description: suppliersCopy.deleteDescription(supplier.name),
      confirmText: suppliersCopy.deleteAction,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });

    if (!ok) return;
    handleDelete(supplier.id);
  }

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      key: "name",
      header: suppliersCopy.title,
      render: (s, i) => (
        <div className="flex items-center gap-3">
          <SupplierAvatar name={s.name} colorIndex={i} />
          <p className="text-sm">{s.name}</p>
        </div>
      ),
    },
    {
      key: "tax_code",
      header: "Mã số thuế",
      render: (s) => (
        <span className="font-mono text-sm text-muted-foreground">
          {s.tax_code ?? "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Điện thoại",
      render: (s) => (
        <span className="font-mono text-sm">{s.phone ?? "—"}</span>
      ),
    },
    {
      key: "address",
      header: "Địa chỉ",
      render: (s) => (
        <p className="max-w-44 truncate text-sm text-muted-foreground">
          {s.address ?? "—"}
        </p>
      ),
    },
    {
      key: "status",
      header: FORM_VI.status,
      render: (s) => (
        <StatusBadge
          domain="inventory"
          value={s.is_active ? "active" : "suspended"}
          size="sm"
        />
      ),
    },
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-24 text-right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          {canManageItems ? (
            <Button
              variant="ghost"
              size="icon"
              render={<Link href={`/inventory/suppliers/${s.id}/items`} />}
              aria-label={suppliersCopy.items.openAria(s.name)}
            >
              <IconPackageSearch className="size-4" />
            </Button>
          ) : null}
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
            onClick={() => confirmDelete(s)}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Xóa ${s.name}`}
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          eyebrow={messages.inventory.shell.moduleName}
          title={suppliersCopy.title}
          actions={
            <Button type="button" size="lg" onClick={openCreate}>
              <IconPlus data-icon="inline-start" />
              {suppliersCopy.createAction}
            </Button>
          }
        />
        <AppSection className="overflow-hidden" contentFlush>
          <AppToolbar
            variant="inline"
            search={
              <InputGroup className="h-12 w-full sm:h-10">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  name="supplier-search"
                  autoComplete="off"
                  placeholder={suppliersCopy.searchPlaceholder}
                  aria-label={suppliersCopy.searchPlaceholder}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  inputMode="search"
                />
              </InputGroup>
            }
            reset={
              <Badge variant="outline">
                {filtered.length}/{rows.length}
              </Badge>
            }
          />

          <DataTable
            columns={columns}
            data={filtered}
            pageSize={25}
            getRowKey={(s) => s.id}
            emptyTitle={
              search.trim()
                ? suppliersCopy.emptySearchTitle
                : suppliersCopy.emptyInitialTitle
            }
            emptyDescription={
              search.trim()
                ? suppliersCopy.emptySearchDescription
                : suppliersCopy.emptyInitialDescription
            }
            emptyMode={search.trim() ? "no-results" : "no-data"}
            mobileCardRender={(s, i) => (
              <SupplierMobileCard
                supplier={s}
                index={i}
                onEdit={openEdit}
                onDelete={confirmDelete}
                canManageItems={canManageItems}
              />
            )}
          />
        </AppSection>
      </AppPage>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
        onSaved={reload}
      />
    </>
  );
}
