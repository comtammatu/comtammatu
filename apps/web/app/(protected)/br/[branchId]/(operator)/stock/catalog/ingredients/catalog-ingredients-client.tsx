"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Eye as IconEye,
  EyeOff as IconEyeOff,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Switch } from "@comtammatu/ui/components/switch";
import { toast } from "@comtammatu/ui/components/sonner";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
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
import { messages } from "@lib/messages";
import { matchesSearch } from "@lib/search";
import { AppEmptyState } from "@/components/surface";
import {
  fetchIngredients,
  toggleIngredientActive,
} from "@/(protected)/inventory/ingredient-actions";
import { IngredientDialog } from "@/(protected)/inventory/ingredients/ingredient-dialog";
import type {
  CategoryOption,
  IngredientRow,
  UnitOption,
} from "@/(protected)/inventory/_lib/types";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";

const copy = messages.catalog.ingredients;

export function CatalogIngredientsClient({
  backHref,
  initial,
  unitOptions,
  categoryOptions,
}: {
  backHref: string;
  initial: IngredientRow[];
  unitOptions: UnitOption[];
  categoryOptions: CategoryOption[];
}) {
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<IngredientRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    let result = rows;
    if (!showArchived) result = result.filter((row) => row.is_active);
    const q = search.trim();
    if (q)
      result = result.filter((row) => matchesSearch([row.name, row.sku], q));
    return result;
  }, [rows, showArchived, search]);

  async function reload() {
    const res = await fetchIngredients();
    if (res.success) {
      setRows((res.data ?? []) as IngredientRow[]);
      return;
    }
    toast.error(res.error ?? copy.reloadFailed);
  }

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(row: IngredientRow) {
    setEditing(row);
    setDialogOpen(true);
  }

  async function handleToggleArchive(row: IngredientRow) {
    if (row.is_active) {
      const ok = await confirm({
        title: copy.archiveTitle,
        description: copy.archiveDescription(row.name),
        confirmText: copy.archiveConfirm,
        cancelText: copy.archiveCancel,
        variant: "destructive",
      });
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await toggleIngredientActive({ id: row.id });
      if (!res.success) {
        toast.error(res.error ?? copy.toggleFailed);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, is_active: !r.is_active } : r,
        ),
      );
      toast.success(
        row.is_active
          ? copy.archiveSuccess(row.name)
          : copy.restoreSuccess(row.name),
      );
    });
  }

  return (
    <BranchOperatorPage
      title={copy.title}
      backHref={backHref}
      backLabel={messages.catalog.index.title}
    >
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

      <Field orientation="horizontal" className="w-auto self-start">
        <FieldLabel htmlFor="catalog-ingredients-show-archived">
          {copy.showArchived}
        </FieldLabel>
        <Switch
          id="catalog-ingredients-show-archived"
          checked={showArchived}
          onCheckedChange={setShowArchived}
        />
      </Field>

      {filtered.length === 0 ? (
        <AppEmptyState compact title={copy.empty} symbol="riceGrain" />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((row) => (
            <Item key={row.id} variant="outline" size="sm">
              <ItemContent className="min-w-0">
                <ItemTitle className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {row.name}
                  </span>
                  {!row.is_active ? (
                    <Badge variant="secondary" className="shrink-0">
                      {copy.archived}
                    </Badge>
                  ) : null}
                </ItemTitle>
                {row.sku ? (
                  <ItemDescription className="truncate font-mono text-xs">
                    {row.sku}
                  </ItemDescription>
                ) : null}
              </ItemContent>
              <ItemActions className="shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  aria-label={copy.editAria(row.name)}
                  onClick={() => openEdit(row)}
                >
                  <IconPencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-touch"
                  disabled={isPending}
                  aria-label={
                    row.is_active
                      ? copy.archiveAria(row.name)
                      : copy.restoreAria(row.name)
                  }
                  onClick={() => handleToggleArchive(row)}
                >
                  {row.is_active ? (
                    <IconEyeOff className="size-4 text-destructive" />
                  ) : (
                    <IconEye className="size-4 text-muted-foreground" />
                  )}
                </Button>
              </ItemActions>
            </Item>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="touch"
        onClick={openCreate}
        className="w-full border-dashed"
      >
        <IconPlus data-icon="inline-start" />
        {copy.add}
      </Button>

      <IngredientDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        ingredient={editing}
        unitOptions={unitOptions}
        categoryOptions={categoryOptions}
        onSaved={reload}
      />
    </BranchOperatorPage>
  );
}
