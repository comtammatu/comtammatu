"use client";

import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  Carrot,
  ChevronRight,
  Ruler,
  SlidersHorizontal,
  Tags,
  UsersRound,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";
import { BranchOperatorControlBar } from "@lib/branch-operator/components/branch-operator-page";

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
      <BranchOperatorControlBar className="sm:hidden">
        <Button
          variant="ghost"
          size="icon-touch"
          render={
            <Link
              href={`${basePath.replace(/\/stock\/catalog$/, "")}/settings`}
              aria-label={copy.title}
            />
          }
        >
          <IconArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{copy.title}</p>
        </div>
      </BranchOperatorControlBar>
      <ItemGroup className="gap-2">
        {rows.map((row) => (
          <Item
            key={row.key}
            variant="outline"
            size="sm"
            className="chrome-tap min-h-12 select-none bg-card"
            render={<Link href={row.href} />}
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
