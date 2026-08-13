"use client";

import { useMemo, useState, useTransition } from "react";
import { Search as IconSearch } from "lucide-react";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import {
  deleteSupplier,
  fetchSuppliers,
} from "@/(protected)/inventory/procurement-actions";
import {
  SupplierDialog,
  type SupplierRow,
} from "@/(protected)/inventory/suppliers/supplier-dialog";
import { CatalogBackControl } from "../catalog-back-header";
import {
  CatalogList,
  CATALOG_DELETE_ICON,
  CATALOG_EDIT_ICON,
} from "../catalog-list";

const copy = messages.catalog.suppliers;

export function CatalogSuppliersClient({
  backHref,
  initial,
}: {
  backHref: string;
  initial: SupplierRow[];
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

  async function handleDelete(row: SupplierRow) {
    const ok = await confirm({
      title: copy.deleteTitle,
      description: copy.deleteDescription(row.name),
      confirmText: copy.deleteConfirm,
      cancelText: ACTIONS_VI.cancel,
      variant: "destructive",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteSupplier(row.id);
      if (!res.success) {
        toast.error(res.error ?? copy.deleteFailed);
        return;
      }
      toast.success(copy.deleteSuccess);
      await reload();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <CatalogBackControl title={copy.title} backHref={backHref} />

      <InputGroup className="h-11">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          inputMode="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={copy.searchPlaceholder}
        />
      </InputGroup>

      <CatalogList
        rows={filtered}
        getRowKey={(row) => row.id}
        renderPrimary={(row) => row.name}
        renderSecondary={(row) => row.phone ?? row.tax_code ?? ""}
        emptyTitle={copy.empty}
        addLabel={copy.add}
        onAdd={openCreate}
        actions={[
          {
            key: "edit",
            icon: CATALOG_EDIT_ICON,
            ariaLabel: (row) => copy.editAria(row.name),
            onSelect: openEdit,
          },
          {
            key: "delete",
            icon: CATALOG_DELETE_ICON,
            ariaLabel: (row) => copy.deleteAria(row.name),
            onSelect: handleDelete,
          },
        ]}
      />

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
        onSaved={reload}
        chrome="sheet"
      />
    </div>
  );
}
