"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  Phone as IconPhone,
  Plus as IconPlus,
  Search as IconSearch,
  Truck as IconTruck,
  Users as IconUsers,
} from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
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
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import { createSupplier } from "@/(protected)/inventory/procurement-actions";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import type { GrnSourcePageData } from "@lib/inventory/grn-source-data";
import {
  filterGrnSourceSuppliers,
  grnSourceSupplierHref,
  type GrnSourceSupplier,
} from "@lib/inventory/grn-source-model";

type BranchGrnSourcePickerClientProps = Pick<
  GrnSourcePageData,
  "canCreateSupplier" | "suppliers" | "suppliersLoadFailed"
> & {
  branchId: number;
};

function BranchSupplierRow({
  href,
  supplier,
}: {
  href: string;
  supplier: GrnSourceSupplier;
}) {
  return (
    <div role="listitem">
      <Item asChild variant="outline" className="min-h-20 touch-manipulation">
        <Link href={href}>
          <ItemContent className="min-w-0 gap-1">
            <ItemTitle size="heading" className="line-clamp-none">
              {supplier.name}
            </ItemTitle>
            <ItemDescription className="line-clamp-none flex flex-wrap items-center gap-x-2 gap-y-1">
              {supplier.phone ? (
                <span className="inline-flex items-center gap-1">
                  <IconPhone className="size-3" />
                  {supplier.phone}
                </span>
              ) : null}
              {supplier.recentLabel ? (
                <span>{supplier.recentLabel}</span>
              ) : null}
              {supplier.lastLabel ? <span>{supplier.lastLabel}</span> : null}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="shrink-0">
            <IconChevronRight className="size-4 text-muted-foreground" />
          </ItemActions>
        </Link>
      </Item>
    </div>
  );
}

export function BranchGrnSourcePickerClient({
  branchId,
  canCreateSupplier,
  suppliers,
  suppliersLoadFailed,
}: BranchGrnSourcePickerClientProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [isCreatingSupplier, startCreateSupplier] = useTransition();
  const sourceBasePath = `/br/${branchId}/stock/grn/new`;
  const supplierHref = (supplierId: number) =>
    grnSourceSupplierHref(sourceBasePath, supplierId);
  const filteredSuppliers = useMemo(
    () => filterGrnSourceSuppliers(suppliers, query),
    [suppliers, query],
  );
  const normalizedQuery = query.trim();
  const hasExactSupplier = useMemo(
    () =>
      suppliers.some(
        (supplier) =>
          supplier.name.trim().toLocaleLowerCase("vi") ===
          normalizedQuery.toLocaleLowerCase("vi"),
      ),
    [suppliers, normalizedQuery],
  );

  function handleCreateSupplier() {
    if (!normalizedQuery || isCreatingSupplier || !canCreateSupplier) return;

    startCreateSupplier(async () => {
      setSupplierError(null);
      const result = await createSupplier({ name: normalizedQuery });
      if (!result.success) {
        setSupplierError(result.error ?? INVENTORY_VI.grnCreateSupplierFailed);
        return;
      }

      const supplierId = (result.data as { id: number } | undefined)?.id;
      if (supplierId == null) {
        setSupplierError(INVENTORY_VI.grnCreateSupplierFailed);
        return;
      }

      router.push(supplierHref(supplierId));
    });
  }

  return (
    <BranchOperatorPage
      title={INVENTORY_VI.newGrn}
      description={INVENTORY_VI.chooseSourceDescription}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button asChild variant="ghost" size="icon-touch">
            <Link
              href={`/br/${branchId}/stock/grn`}
              aria-label={ACTIONS_VI.back}
            >
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {INVENTORY_VI.newGrn}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {INVENTORY_VI.chooseSourceDescription}
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorPanel
          title={INVENTORY_VI.receiveBySupplierTitle}
          description={INVENTORY_VI.receiveBySupplierDescription}
          icon={IconTruck}
          contentClassName="gap-3"
        >
          <InputGroup className="h-12">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={INVENTORY_VI.supplierSearchPlaceholder}
              className="text-base"
              inputMode="search"
            />
          </InputGroup>

          {supplierError ? (
            <p role="alert" className="text-sm text-destructive">
              {supplierError}
            </p>
          ) : null}

          {suppliersLoadFailed ? (
            <AppEmptyState
              compact
              mode="error"
              icon={<IconUsers />}
              title={INVENTORY_VI.grnSupplierLoadFailed}
            >
              <Button
                type="button"
                size="touch"
                onClick={() => router.refresh()}
              >
                {ACTIONS_VI.retry}
              </Button>
            </AppEmptyState>
          ) : (
            <>
              {normalizedQuery && !hasExactSupplier && canCreateSupplier ? (
                <ItemGroup className="gap-2">
                  <div role="listitem">
                    <Item
                      asChild
                      variant="outline"
                      className="min-h-16 border-primary/20 bg-primary/10 touch-manipulation"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        disabled={isCreatingSupplier}
                        onClick={handleCreateSupplier}
                      >
                        <ItemContent className="min-w-0">
                          <ItemTitle
                            size="heading"
                            className="line-clamp-none text-primary"
                          >
                            {isCreatingSupplier
                              ? INVENTORY_VI.grnCreateSupplierPending
                              : INVENTORY_VI.grnCreateSupplierInline(
                                  normalizedQuery,
                                )}
                          </ItemTitle>
                        </ItemContent>
                        <ItemActions className="shrink-0 text-primary">
                          {isCreatingSupplier ? (
                            <Spinner className="size-4" />
                          ) : (
                            <IconPlus className="size-4" />
                          )}
                        </ItemActions>
                      </button>
                    </Item>
                  </div>
                </ItemGroup>
              ) : null}

              {filteredSuppliers.length === 0 ? (
                <AppEmptyState
                  compact
                  mode={normalizedQuery ? "no-results" : "no-data"}
                  icon={normalizedQuery ? <IconSearch /> : <IconUsers />}
                  title={
                    normalizedQuery
                      ? INVENTORY_VI.supplierNotFound
                      : INVENTORY_VI.noSupplierTitle
                  }
                  description={
                    normalizedQuery
                      ? undefined
                      : INVENTORY_VI.noSupplierDescription
                  }
                />
              ) : (
                <ItemGroup className="gap-2">
                  {filteredSuppliers.map((supplier) => (
                    <BranchSupplierRow
                      key={supplier.id}
                      href={supplierHref(supplier.id)}
                      supplier={supplier}
                    />
                  ))}
                </ItemGroup>
              )}
            </>
          )}
        </BranchOperatorPanel>

        <AppDetailFooter
          sticky
          leading={
            <Button asChild variant="outline" size="touch">
              <Link href={`/br/${branchId}/stock/grn`}>{ACTIONS_VI.back}</Link>
            </Button>
          }
        />
      </div>
    </BranchOperatorPage>
  );
}
