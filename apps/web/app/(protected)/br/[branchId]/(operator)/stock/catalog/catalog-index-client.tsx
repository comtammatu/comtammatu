"use client";

import Link from "next/link";
import {
  Carrot,
  ChevronRight,
  Ruler,
  SlidersHorizontal,
  Tags,
  UsersRound,
} from "lucide-react";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";

const copy = messages.catalog.index;

type CatalogCounts = {
  categories: number;
  ingredients: number;
  units: number;
  thresholds: number;
  suppliers: number;
};

type DrillRow = {
  key: keyof CatalogCounts;
  href: string;
  icon: typeof Tags;
  title: string;
};

export function CatalogIndexClient({
  basePath,
  counts,
}: {
  basePath: string;
  counts: CatalogCounts;
}) {
  const rows: DrillRow[] = [
    {
      key: "categories",
      href: `${basePath}/categories`,
      icon: Tags,
      title: copy.rows.categories,
    },
    {
      key: "ingredients",
      href: `${basePath}/ingredients`,
      icon: Carrot,
      title: copy.rows.ingredients,
    },
    {
      key: "units",
      href: `${basePath}/units`,
      icon: Ruler,
      title: copy.rows.units,
    },
    {
      key: "thresholds",
      href: `${basePath}/thresholds`,
      icon: SlidersHorizontal,
      title: copy.rows.thresholds,
    },
    {
      key: "suppliers",
      href: `${basePath}/suppliers`,
      icon: UsersRound,
      title: copy.rows.suppliers,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <ItemGroup className="gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Item
            key={row.key}
            variant="outline"
            size="sm"
            className="chrome-tap min-h-12 min-w-0 flex-nowrap select-none bg-card"
            render={<Link href={row.href} prefetch={true} />}
          >
            <ItemMedia
              variant="icon"
              className="rounded-md bg-muted p-2 text-muted-foreground"
            >
              <row.icon aria-hidden="true" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle size="heading">{row.title}</ItemTitle>
            </ItemContent>
            <ItemActions className="shrink-0 text-muted-foreground">
              <span className="font-mono text-sm tabular-nums">
                {counts[row.key]}
              </span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </div>
  );
}
