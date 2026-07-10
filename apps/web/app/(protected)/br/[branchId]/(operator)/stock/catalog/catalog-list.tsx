"use client";

import type { ReactNode } from "react";
import {
  Pencil as IconPencil,
  Plus as IconPlus,
  Trash2 as IconTrash,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppEmptyState } from "@/components/surface";

export type CatalogListAction<TRow> = {
  key: string;
  icon: ReactNode;
  ariaLabel: (row: TRow) => string;
  className?: string;
  onSelect: (row: TRow) => void;
};

export function CatalogList<TRow>({
  rows,
  getRowKey,
  renderPrimary,
  renderSecondary,
  actions,
  emptyTitle,
  addLabel,
  onAdd,
}: {
  rows: TRow[];
  getRowKey: (row: TRow) => string | number;
  renderPrimary: (row: TRow) => ReactNode;
  renderSecondary?: (row: TRow) => ReactNode;
  actions: CatalogListAction<TRow>[];
  emptyTitle: string;
  addLabel: string;
  onAdd: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <AppEmptyState compact title={emptyTitle} symbol="riceGrain" />
      ) : (
        <ItemGroup className="gap-2">
          {rows.map((row) => {
            const secondary = renderSecondary?.(row);
            return (
              <Item
                key={getRowKey(row)}
                variant="outline"
                size="sm"
                className="min-h-12"
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-2 min-w-0 break-words text-sm font-medium">
                    {renderPrimary(row)}
                  </ItemTitle>
                  {secondary ? (
                    <ItemDescription className="line-clamp-2 break-words text-xs">
                      {secondary}
                    </ItemDescription>
                  ) : null}
                </ItemContent>
                <ItemActions className="shrink-0 gap-1">
                  {actions.map((action) => (
                    <Button
                      key={action.key}
                      type="button"
                      variant="ghost"
                      size="icon-touch"
                      aria-label={action.ariaLabel(row)}
                      className={action.className}
                      onClick={() => action.onSelect(row)}
                    >
                      {action.icon}
                    </Button>
                  ))}
                </ItemActions>
              </Item>
            );
          })}
        </ItemGroup>
      )}

      <Button
        type="button"
        variant="outline"
        size="touch"
        onClick={onAdd}
        className="w-full border-dashed"
      >
        <IconPlus aria-hidden="true" data-icon="inline-start" />
        {addLabel}
      </Button>
    </div>
  );
}

export const CATALOG_EDIT_ICON = (
  <IconPencil aria-hidden="true" className="size-4" />
);
export const CATALOG_DELETE_ICON = (
  <IconTrash aria-hidden="true" className="size-4 text-destructive" />
);
