"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackagePlus as IconPackagePlus,
  Search as IconSearch,
  Trash2 as IconTrash,
} from "lucide-react";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormDialog, SelectField, TextField } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import {
  AppBackLink,
  AppListFrame,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import { createSupplierItem, deleteSupplierItem, setSupplierItemPreferred } from "./actions";

export type SupplierIngredientOption = {
  id: number;
  name: string;
  sku: string | null;
};

export type SupplierItemRow = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  ingredientSku: string | null;
  supplierSkuCode: string;
  isPreferred: boolean;
};

const itemSchema = z.object({
  ingredientId: z.string().min(1, { error: "Chọn nguyên liệu." }),
  supplierSkuCode: z.string().trim().min(1, { error: "Nhập mã hàng NCC." }),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const copy = messages.inventory.suppliers.items;

export function SupplierItemsClient({
  supplier,
  ingredients,
  rows,
  canManage,
}: {
  supplier: { id: number; name: string };
  ingredients: SupplierIngredientOption[];
  rows: SupplierItemRow[];
  canManage: boolean;
}) {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultValues = useMemo<ItemFormValues>(
    () => ({ ingredientId: "", supplierSkuCode: "" }),
    [],
  );
  const mappedIngredientIds = useMemo(
    () => new Set(rows.map((row) => row.ingredientId)),
    [rows],
  );
  const availableIngredients = useMemo(
    () => ingredients.filter((item) => !mappedIngredientIds.has(item.id)),
    [ingredients, mappedIngredientIds],
  );
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(
          [row.ingredientName, row.ingredientSku, row.supplierSkuCode],
          search,
        ),
      ),
    [rows, search],
  );

  async function remove(row: SupplierItemRow) {
    // confirm() must run outside startTransition — same deadlock as PO approve.
    const accepted = await confirm({
      title: copy.removeTitle,
      description: copy.removeDescription(row.ingredientName, supplier.name),
      confirmText: copy.removeAction,
      variant: "destructive",
    });
    if (!accepted) return;

    startTransition(async () => {
      const result = await deleteSupplierItem({
        supplierId: supplier.id,
        itemId: row.id,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(copy.removeSuccess);
      router.refresh();
    });
  }

  function setPreferred(row: SupplierItemRow, isPreferred: boolean) {
    startTransition(async () => {
      const result = await setSupplierItemPreferred({
        supplierId: supplier.id,
        itemId: row.id,
        isPreferred,
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(
        isPreferred ? copy.setPreferredSuccess : copy.clearPreferredSuccess,
      );
      router.refresh();
    });
  }

  const getSupplierItemRowActions = (row: SupplierItemRow): RowActionItem[] => [
    ...(row.isPreferred
      ? [
          {
            key: "clear-preferred",
            label: copy.clearPreferredAction,
            disabled: isPending,
            onSelect: () => {
              setPreferred(row, false);
            },
          } satisfies RowActionItem,
        ]
      : [
          {
            key: "set-preferred",
            label: copy.setPreferredAction,
            disabled: isPending,
            onSelect: () => {
              setPreferred(row, true);
            },
          } satisfies RowActionItem,
        ]),
    {
      key: "remove",
      label: copy.removeAria(row.ingredientName),
      icon: <IconTrash />,
      destructive: true,
      disabled: isPending,
      onSelect: () => {
        void remove(row);
      },
    },
  ];

  const columns: DataTableColumn<SupplierItemRow>[] = [
    {
      key: "ingredient",
      header: copy.ingredient,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{row.ingredientName}</span>
          {row.isPreferred ? (
            <Badge variant="secondary">{copy.preferredBadge}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      key: "ingredientSku",
      header: copy.internalSku,
      render: (row) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.ingredientSku ?? "—"}
        </span>
      ),
    },
    {
      key: "supplierSku",
      header: copy.supplierSku,
      render: (row) => (
        <span className="font-mono text-sm">{row.supplierSkuCode}</span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: FORM_VI.action,
            className: "w-14",
            render: (row: SupplierItemRow) => {
              const items = getSupplierItemRowActions(row);
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
          } satisfies DataTableColumn<SupplierItemRow>,
        ]
      : []),
  ];

  return (
    <>
      <AppPage width="wide" scroll>
        <AppPageHeader
          breadcrumb={
            <AppBackLink href="/inventory/suppliers">
              {messages.inventory.suppliers.title}
            </AppBackLink>
          }
          title={supplier.name}
          description={copy.description}
          actions={
            canManage ? (
              <Button
                type="button"
                size="touch"
                disabled={availableIngredients.length === 0}
                onClick={() => setDialogOpen(true)}
              >
                <IconPackagePlus />
                {copy.addAction}
              </Button>
            ) : null
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
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={copy.searchPlaceholder}
                    aria-label={copy.searchPlaceholder}
                  />
                </InputGroup>
              }
              reset={
                <Badge variant="outline" className="rounded-full">
                  {filtered.length}/{rows.length}
                </Badge>
              }
            />
          }
        >
          <DataTable
            columns={columns}
            data={filtered}
            getRowKey={(row) => row.id}
            pageSize={25}
            renderRowContextMenu={
              canManage
                ? (row) => (
                    <RowActionsContextMenuItems
                      items={getSupplierItemRowActions(row)}
                    />
                  )
                : undefined
            }
            emptyTitle={search.trim() ? copy.emptySearchTitle : copy.emptyTitle}
            emptyDescription={
              search.trim()
                ? copy.emptySearchDescription
                : copy.emptyDescription
            }
            emptyMode={search.trim() ? "no-results" : "no-data"}
            mobileCardRender={(row) => (
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {row.ingredientName}
                      {row.isPreferred ? (
                        <Badge variant="secondary">{copy.preferredBadge}</Badge>
                      ) : null}
                    </span>
                  </ItemTitle>
                  <ItemDescription>
                    {copy.supplierSku}: {row.supplierSkuCode}
                  </ItemDescription>
                  {row.ingredientSku ? (
                    <ItemDescription>
                      {copy.internalSku}: {row.ingredientSku}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
                {canManage ? (
                  <ItemActions className="self-center">
                    <div onClick={(event) => event.stopPropagation()}>
                      <RowActionsMenu
                        items={getSupplierItemRowActions(row)}
                        label={FORM_VI.action}
                        triggerSize="icon-touch"
                      />
                    </div>
                  </ItemActions>
                ) : null}
              </Item>
            )}
          />
        </AppListFrame>
      </AppPage>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={copy.addTitle}
        schema={itemSchema}
        defaultValues={defaultValues}
        entityKey="new-supplier-item"
        submitLabel={copy.addSubmit}
        successMessage={copy.addSuccess}
        onSubmit={(values) =>
          createSupplierItem({
            supplierId: supplier.id,
            ingredientId: Number(values.ingredientId),
            supplierSkuCode: values.supplierSkuCode,
          })
        }
        onSuccess={() => router.refresh()}
      >
        {(form) => (
          <>
            <SelectField
              control={form.control}
              name="ingredientId"
              label={copy.ingredient}
              options={availableIngredients.map((item) => ({
                value: String(item.id),
                label: item.sku ? `${item.name} · ${item.sku}` : item.name,
              }))}
              required
            />
            <TextField
              control={form.control}
              name="supplierSkuCode"
              label={copy.supplierSku}
              placeholder={copy.supplierSkuPlaceholder}
              required
            />
          </>
        )}
      </FormDialog>
    </>
  );
}
