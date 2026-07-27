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
  AppBackLink,
  AppPage,
  AppPageHeader,
  AppToolbar,
} from "@/components/surface";
import { InventoryListFrame } from "../../../_components/inventory-list-frame";
import { useFormControlSize } from "@/components/form/control-size";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { createSupplierItem, deleteSupplierItem } from "./actions";

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

  function remove(row: SupplierItemRow) {
    startTransition(async () => {
      const accepted = await confirm({
        title: copy.removeTitle,
        description: copy.removeDescription(row.ingredientName, supplier.name),
        confirmText: copy.removeAction,
        variant: "destructive",
      });
      if (!accepted) return;

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

  const columns: DataTableColumn<SupplierItemRow>[] = [
    {
      key: "ingredient",
      header: copy.ingredient,
      render: (row) => (
        <span className="font-medium">{row.ingredientName}</span>
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
    {
      key: "actions",
      header: "",
      className: "w-12",
      render: (row) =>
        canManage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={isPending}
            onClick={() => remove(row)}
            aria-label={copy.removeAria(row.ingredientName)}
          >
            <IconTrash />
          </Button>
        ) : null,
    },
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
          eyebrow={copy.eyebrow}
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
        <InventoryListFrame
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
                  <ItemTitle>{row.ingredientName}</ItemTitle>
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
                  <ItemActions>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      disabled={isPending}
                      onClick={() => remove(row)}
                      aria-label={copy.removeAria(row.ingredientName)}
                    >
                      <IconTrash />
                    </Button>
                  </ItemActions>
                ) : null}
              </Item>
            )}
          />
        </InventoryListFrame>
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
