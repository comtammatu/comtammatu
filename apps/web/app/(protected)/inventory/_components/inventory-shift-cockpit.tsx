"use client";

import Link from "next/link";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { formatCount } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppSection } from "@/components/surface";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import { withControlSurfaceBranchScope } from "@/lib/control-surface-scope";
import type { OperationalCount } from "@lib/inventory/operational-count";
import { messages } from "@lib/messages";

const copy = messages.inventory.shiftCockpit;

export interface InventoryShiftCockpitProps {
  branchId: number | null;
  scopeAll?: boolean;
  title: string;
  items: Array<{
    id: string;
    label: string;
    href: string;
    result: OperationalCount;
  }>;
  canAccessProduction: boolean;
  canAccessStock: boolean;
}

export function InventoryShiftCockpit({
  branchId,
  scopeAll,
  title,
  items,
  canAccessProduction,
  canAccessStock,
}: InventoryShiftCockpitProps) {
  const scope =
    branchId != null
      ? (String(branchId) as `${number}`)
      : scopeAll
        ? "all"
        : null;
  const scopeHref = (href: string) =>
    scope == null
      ? href
      : withControlSurfaceBranchScope(href, scope, {
          prefixes: ["/inventory"],
        });
  const visibleItems = items.filter(
    (item) => item.result.status !== "forbidden",
  );
  const unavailable = visibleItems.some(
    (item) => item.result.status === "unavailable",
  );

  return (
    <div className="grid gap-3">
      {visibleItems.length > 0 ? (
        <AppSection
          title={title}
          headingLevel="h2"
          action={
            unavailable ? (
              <ResponsiveActionButton
                variant="outline"
                onClick={() => window.location.reload()}
              >
                {copy.retry}
              </ResponsiveActionButton>
            ) : undefined
          }
        >
          <ItemGroup role="group">
            {visibleItems.map((item) => (
              <Item
                key={item.id}
                variant="outline"
                size="sm"
                className="min-h-11"
                render={<Link href={scopeHref(item.href)} />}
              >
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none">
                    {item.label}
                  </ItemTitle>
                </ItemContent>
                <ItemActions className="ml-auto shrink-0">
                  {item.result.status === "ready" ? (
                    <Badge
                      variant={item.result.count > 0 ? "warning" : "outline"}
                    >
                      {formatCount(item.result.count)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{copy.unavailable}</Badge>
                  )}
                  <IconArrowRight className="size-4" aria-hidden />
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        </AppSection>
      ) : null}
      {canAccessStock || canAccessProduction ? (
        <div className="grid items-start gap-3 lg:grid-cols-2">
          {canAccessStock ? (
            <AppSection title={copy.stockTitle} headingLevel="h2">
              <ItemGroup role="group">
                <Item
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  render={<Link href={scopeHref("/inventory/stock")} />}
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle>{copy.stockAction}</ItemTitle>
                    <ItemDescription>{copy.stockUnavailable}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <IconArrowRight className="size-4" aria-hidden />
                  </ItemActions>
                </Item>
              </ItemGroup>
            </AppSection>
          ) : null}
          {canAccessProduction ? (
            <AppSection title={copy.productionTitle} headingLevel="h2">
              <ItemGroup role="group">
                <Item
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  render={<Link href={scopeHref("/inventory/production")} />}
                >
                  <ItemContent className="min-w-0">
                    <ItemTitle>{copy.productionAction}</ItemTitle>
                    <ItemDescription>
                      {copy.productionUnavailable}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <IconArrowRight className="size-4" aria-hidden />
                  </ItemActions>
                </Item>
              </ItemGroup>
            </AppSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
