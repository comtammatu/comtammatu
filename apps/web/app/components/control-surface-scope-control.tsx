"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store as IconBuildingStore } from "lucide-react";
import { getSiteKindLabelVi } from "@comtammatu/shared/labels";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { messages } from "@lib/messages";
import {
  getControlSurfaceScopeBranchId,
  groupSitesByKind,
  resolveScopeFromSearchParams,
  shouldGroupSitesByKind,
  sortSitesByKind,
  type ControlSurfaceBranchScope,
} from "@/lib/control-surface-scope";

export type ControlSurfaceScopeSite = {
  id: number;
  name: string;
  branch_kind: string;
};

export type ControlSurfaceAggregateOption =
  | "all"
  | "office"
  | "company"
  | "branches";

type Props = {
  sites: readonly ControlSurfaceScopeSite[];
  aggregates?: readonly ControlSurfaceAggregateOption[];
  /** Clear HR drill-down keys when scope changes. */
  clearHrDrilldown?: boolean;
  /** Clear Finance `location` when writing unified `branch`. */
  clearFinanceLocation?: boolean;
  fallback?: ControlSurfaceBranchScope;
  allowedIds?: readonly number[];
};

const copy = messages.controlSurface.scopeControl;

const AGGREGATE_LABEL: Record<ControlSurfaceAggregateOption, string> = {
  all: copy.all,
  office: copy.office,
  company: copy.company,
  branches: copy.allSalesBranches,
};

export function ControlSurfaceScopeControl({
  sites,
  aggregates = ["all"],
  clearHrDrilldown = false,
  clearFinanceLocation = false,
  fallback = "all",
  allowedIds,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isTouchLayout = useIsMobile(1024);

  const resolvedAllowedIds = useMemo(
    () => allowedIds ?? sites.map((site) => site.id),
    [allowedIds, sites],
  );

  const currentScope = useMemo((): ControlSurfaceBranchScope => {
    const fromUrl = resolveScopeFromSearchParams(searchParams, {
      allowedIds: resolvedAllowedIds,
      fallback,
    });
    if (
      (fromUrl === "all" ||
        fromUrl === "office" ||
        fromUrl === "company" ||
        fromUrl === "branches") &&
      !aggregates.includes(fromUrl)
    ) {
      return fallback;
    }
    return fromUrl;
  }, [searchParams, resolvedAllowedIds, fallback, aggregates]);

  const currentId = getControlSurfaceScopeBranchId(currentScope);
  const currentSite = useMemo(
    () => sites.find((site) => site.id === currentId) ?? null,
    [sites, currentId],
  );
  const groups = useMemo(() => groupSitesByKind(sites), [sites]);
  const useGroupedSites = useMemo(() => shouldGroupSitesByKind(sites), [sites]);
  const flatSites = useMemo(() => sortSitesByKind(sites), [sites]);

  const displayLabel = useMemo(() => {
    if (currentScope === "all") return AGGREGATE_LABEL.all;
    if (currentScope === "office") return AGGREGATE_LABEL.office;
    if (currentScope === "company") return AGGREGATE_LABEL.company;
    if (currentScope === "branches") return AGGREGATE_LABEL.branches;
    return currentSite?.name ?? copy.pickSite;
  }, [currentScope, currentSite]);

  const handleChange = useCallback(
    (value: string) => {
      if (value === currentScope) return;
      const next = new URLSearchParams(searchParams.toString());
      next.set("branch", value);
      next.delete("branchId");
      if (clearFinanceLocation) {
        next.delete("location");
      }
      if (clearHrDrilldown) {
        next.delete("employee");
        next.delete("day");
        next.delete("calendar");
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [
      clearFinanceLocation,
      clearHrDrilldown,
      currentScope,
      pathname,
      router,
      searchParams,
    ],
  );

  if (sites.length <= 1 && aggregates.length === 0) return null;

  return (
    <Select value={currentScope} onValueChange={handleChange}>
      <SelectTrigger
        size={isTouchLayout ? "touch" : "default"}
        aria-label={copy.ariaLabel}
        className="flex h-9 min-w-0 w-full items-center justify-start gap-2 overflow-hidden bg-sidebar-accent/40 px-2.5 py-1.5 text-left text-sm font-medium text-sidebar-foreground shadow-none hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring [&>svg:last-child]:ml-auto [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate"
      >
        <IconBuildingStore className="size-4 shrink-0 text-sidebar-foreground/70" />
        <SelectValue placeholder={copy.label}>
          <span className="block min-w-0 truncate">{displayLabel}</span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className="no-scrollbar max-h-64 min-w-56 [&_[data-position=popper]]:h-auto"
        position="popper"
        side="bottom"
        sideOffset={4}
      >
        {aggregates.map((aggregate) => (
          <SelectItem
            key={aggregate}
            value={aggregate}
            label={AGGREGATE_LABEL[aggregate]}
            className={isTouchLayout ? "min-h-12 text-sm" : undefined}
          >
            {AGGREGATE_LABEL[aggregate]}
          </SelectItem>
        ))}
        {useGroupedSites
          ? groups.map((group) => (
              <SelectGroup key={group.kind}>
                <SelectLabel>{getSiteKindLabelVi(group.kind)}</SelectLabel>
                {group.items.map((site) => (
                  <SelectItem
                    key={site.id}
                    value={String(site.id)}
                    label={site.name}
                    className={isTouchLayout ? "min-h-12 text-sm" : undefined}
                  >
                    <span className="block min-w-0 truncate">
                      {site.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))
          : flatSites.map((site) => (
              <SelectItem
                key={site.id}
                value={String(site.id)}
                label={site.name}
                className={isTouchLayout ? "min-h-12 text-sm" : undefined}
              >
                <span className="block min-w-0 truncate">
                  {site.name}
                </span>
              </SelectItem>
            ))}
      </SelectContent>
    </Select>
  );
}
