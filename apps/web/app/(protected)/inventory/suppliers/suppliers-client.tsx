"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PackageSearch as IconPackageSearch,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { useFormControlSize } from "@/components/form/control-size";
import { confirm } from "@/components/confirm-dialog";
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
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { StatusBadge } from "@/components/status-badge";
import { deleteSupplier, fetchSuppliers } from "../procurement-actions";
import { SupplierDialog } from "./supplier-dialog";
import type { SupplierRow } from "./supplier-dialog";
import {
  SupplierItemsClient,
  type SupplierIngredientOption,
  type SupplierItemRow,
} from "./[id]/items/supplier-items-client";

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
        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
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
  actions,
  onOpen,
}: {
  supplier: SupplierRow;
  index: number;
  actions: RowActionItem[];
  onOpen?: (row: SupplierRow) => void;
}) {
  return (
    <InteractiveCard
      minHeight="mobile"
      padding="default"
      className="flex-col items-stretch gap-2"
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(supplier) : undefined}
      onKeyDown={
        onOpen
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(supplier);
              }
            }
          : undefined
      }
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
        <div
          className="flex items-center gap-2"
          onClick={(event) => event.stopPropagation()}
        >
          <StatusBadge
            domain="inventory"
            value={supplier.is_active ? "active" : "suspended"}
            size="sm"
          />
          <RowActionsMenu
            items={actions}
            label={FORM_VI.action}
            triggerSize="icon-touch"
          />
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1 border-t pt-2 text-xs text-muted-foreground">
        <span>
          {suppliersCopy.items.ingredientCount(supplier.ingredient_count ?? 0)}
        </span>
        {supplier.tax_code && (
          <span className="font-mono">MST: {supplier.tax_code}</span>
        )}
        {supplier.address && (
          <span className="truncate">{supplier.address}</span>
        )}
      </div>
    </InteractiveCard>
  );
}

export function SuppliersClient({
  initial,
  canReadItems,
  canManageItems,
  ingredients,
  items,
}: {
  initial: SupplierRow[];
  canReadItems: boolean;
  canManageItems: boolean;
  ingredients: SupplierIngredientOption[];
  items: SupplierItemRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const selectedSupplierId = Number(searchParams.get("supplierId"));
  const selectedSupplier =
    canReadItems && Number.isSafeInteger(selectedSupplierId)
      ? (rows.find((supplier) => supplier.id === selectedSupplierId) ?? null)
      : null;

  useEffect(() => setRows(initial), [initial]);

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

  function openItems(row: SupplierRow) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("supplierId", String(row.id));
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }

  function closeItems() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("supplierId");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
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

  const getSupplierRowActions = (s: SupplierRow): RowActionItem[] => [
    ...(canReadItems
      ? [
          {
            key: "items",
            label: suppliersCopy.items.openAction,
            icon: <IconPackageSearch />,
            onSelect: () => openItems(s),
          } satisfies RowActionItem,
        ]
      : []),
    {
      key: "edit",
      label: ACTIONS_VI.edit,
      icon: <IconPencil />,
      onSelect: () => openEdit(s),
    },
    {
      key: "delete",
      label: ACTIONS_VI.delete,
      icon: <IconTrash />,
      destructive: true,
      separatorBefore: true,
      onSelect: () => {
        void confirmDelete(s);
      },
    },
  ];

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      key: "name",
      header: suppliersCopy.nameColumn,
      className: "min-w-64",
      render: (s, i) => (
        <div className="flex items-center gap-3">
          <SupplierAvatar name={s.name} colorIndex={i} />
          <p className="font-medium">{s.name}</p>
        </div>
      ),
    },
    {
      key: "tax_code",
      header: suppliersCopy.taxCodeColumn,
      className: "w-44",
      render: (s) => (
        <span className="font-mono text-sm text-muted-foreground">
          {s.tax_code ?? "—"}
        </span>
      ),
    },
    {
      key: "ingredients",
      header: suppliersCopy.items.ingredient,
      className: "w-32",
      render: (s) => (
        <span
          className={cn(
            "font-medium tabular-nums",
            canReadItems && "text-primary",
          )}
        >
          {s.ingredient_count ?? 0}
        </span>
      ),
    },
    {
      key: "actions",
      header: FORM_VI.action,
      className: "w-24 text-right",
      render: (s) => {
        const items = getSupplierRowActions(s);
        return (
          <div
            className="flex justify-end"
            onClick={(event) => event.stopPropagation()}
          >
            <RowActionsMenu
              items={items}
              label={FORM_VI.action}
              triggerSize="icon-sm"
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <AppPage width="xwide" density="compact">
        <AppPageHeader
          title={suppliersCopy.title}
          actions={
            <Button type="button" size="lg" onClick={openCreate}>
              <IconPlus data-icon="inline-start" />
              {suppliersCopy.createAction}
            </Button>
          }
        />
        <AppListFrame
          toolbar={
            <AppToolbar
              variant="inline"
              search={
                <InputGroup size={controlSize} className="w-full">
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
          }
        >
          <DataTable
            columns={columns}
            data={filtered}
            pageSize={25}
            getRowKey={(s) => s.id}
            onRowClick={canReadItems ? openItems : undefined}
            renderRowContextMenu={(s) => (
              <RowActionsContextMenuItems items={getSupplierRowActions(s)} />
            )}
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
                actions={getSupplierRowActions(s)}
                onOpen={canReadItems ? openItems : undefined}
              />
            )}
          />
        </AppListFrame>
      </AppPage>

      <SupplierDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        supplier={editingSupplier}
        onSaved={reload}
      />
      {selectedSupplier ? (
        <SupplierItemsClient
          open
          onOpenChange={(open) => {
            if (!open) closeItems();
          }}
          supplier={selectedSupplier}
          ingredients={ingredients}
          rows={items}
          canManage={canManageItems}
        />
      ) : null}
    </>
  );
}
