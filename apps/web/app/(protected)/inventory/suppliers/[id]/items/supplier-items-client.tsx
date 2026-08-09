"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PackagePlus as IconPackagePlus,
  Search as IconSearch,
  Trash2 as IconTrash,
} from "lucide-react";
import { useFieldArray, type UseFormReturn } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@/components/confirm-dialog";
import { Frame } from "@comtammatu/ui/components/frame";
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
import { AppDialog, FormDialog, MultiSelectCombobox } from "@/components/form";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  RowActionsContextMenuItems,
  RowActionsMenu,
  type RowActionItem,
} from "@/components/row-actions-menu";
import { AppListFrame, AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import { matchesSearch } from "@lib/search";
import { messages } from "@lib/messages";
import { FORM_VI } from "@comtammatu/shared/messages";
import {
  createSupplierItems,
  deleteSupplierItem,
  setSupplierItemPreferred,
} from "./actions";

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
  isPreferred: boolean;
};

const itemSchema = z.object({
  items: z
    .array(
      z.object({
        ingredientId: z.string().min(1, { error: "Chọn nguyên liệu." }),
      }),
    )
    .min(1, { error: "Chọn ít nhất một nguyên liệu." }),
});

type ItemFormValues = z.infer<typeof itemSchema>;

const copy = messages.inventory.suppliers.items;

function SupplierItemsFormFields({
  form,
  ingredients,
}: {
  form: UseFormReturn<ItemFormValues>;
  ingredients: SupplierIngredientOption[];
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients],
  );
  const selectedIds = new Set(fields.map((field) => field.ingredientId));

  return (
    <div className="flex flex-col gap-3">
      <MultiSelectCombobox
        options={ingredients.map((ingredient) => ({
          value: String(ingredient.id),
          label: ingredient.name,
          hint: ingredient.sku ?? undefined,
          alreadySelected: selectedIds.has(String(ingredient.id)),
        }))}
        onConfirm={(ingredientIds) =>
          append(
            ingredientIds.map((ingredientId) => ({
              ingredientId,
            })),
          )
        }
        triggerLabel={copy.selectMultiple}
        confirmLabel={copy.selectCount}
        searchPlaceholder={copy.selectSearchPlaceholder}
        triggerClassName="w-full"
      />
      {form.formState.errors.items?.message ? (
        <p className="text-sm text-destructive" role="alert">
          {form.formState.errors.items.message}
        </p>
      ) : null}
      {fields.length > 0 ? (
        <Frame className="max-h-[50vh] overflow-y-auto">
          <div className="divide-y">
            {fields.map((field, index) => {
              const ingredient = ingredientById.get(Number(field.ingredientId));
              return (
                <div key={field.id} className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {ingredient?.name ?? copy.ingredient}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {copy.internalSku}: {ingredient?.sku ?? "—"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-touch"
                    aria-label={copy.removeSelectedAria(
                      ingredient?.name ?? copy.ingredient,
                    )}
                    onClick={() => remove(index)}
                  >
                    <IconTrash />
                  </Button>
                </div>
              );
            })}
          </div>
        </Frame>
      ) : null}
    </div>
  );
}

export function SupplierItemsClient({
  supplier,
  ingredients,
  rows,
  canManage,
  open,
  onOpenChange,
}: {
  supplier: { id: number; name: string };
  ingredients: SupplierIngredientOption[];
  rows: SupplierItemRow[];
  canManage: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const defaultValues = useMemo<ItemFormValues>(() => ({ items: [] }), []);
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
        matchesSearch([row.ingredientName, row.ingredientSku], search),
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
      label: copy.removeAction,
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
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{row.ingredientName}</span>
            {row.isPreferred ? (
              <Badge variant="secondary">{copy.preferredBadge}</Badge>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {copy.internalSku}: {row.ingredientSku ?? "—"}
          </p>
        </div>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: FORM_VI.action,
            className: "w-24 text-right",
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
      {dialogOpen ? null : (
        <AppDialog
          open={open}
          onOpenChange={onOpenChange}
          title={supplier.name}
          description={`${copy.description} ${copy.multiSupplierHint}`}
          contentClassName="max-h-dvh-95 overflow-hidden sm:max-w-3xl"
          bodyClassName="min-h-0 overflow-y-auto p-0"
        >
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
        </AppDialog>
      )}

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={copy.addTitle}
        schema={itemSchema}
        defaultValues={defaultValues}
        entityKey="new-supplier-item"
        submitLabel={copy.addSubmit}
        successMessage={copy.addSuccess}
        contentClassName="sm:max-w-2xl"
        onSubmit={(values) =>
          createSupplierItems({
            supplierId: supplier.id,
            items: values.items.map((item) => ({
              ingredientId: Number(item.ingredientId),
            })),
          })
        }
        onSuccess={() => router.refresh()}
      >
        {(form) => (
          <SupplierItemsFormFields
            form={form}
            ingredients={availableIngredients}
          />
        )}
      </FormDialog>
    </>
  );
}
