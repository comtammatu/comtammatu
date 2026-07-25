"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight as IconChevronRight,
  Phone as IconPhone,
  Plus as IconPlus,
  Receipt as IconReceipt,
  Search as IconSearch,
  Users as IconUsers,
} from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { matchesSearch } from "@lib/search";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { AppEmptyState } from "@/components/surface";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { createSupplier } from "../../procurement-actions";

export type PickerSupplier = {
  id: number;
  name: string;
  phone: string | null;
  recentLabel: string | null;
  lastLabel: string | null;
};

export function SupplierPicker({
  suppliers,
  basePath,
  branchId,
  canCreate,
}: {
  suppliers: PickerSupplier[];
  basePath: string;
  branchId?: number | null;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const needle = query.trim();

  const filtered = React.useMemo(() => {
    if (!needle) return suppliers;
    return suppliers.filter((s) => matchesSearch([s.name, s.phone], needle));
  }, [suppliers, needle]);

  const hasExactMatch = React.useMemo(
    () =>
      suppliers.some(
        (s) => s.name.trim().toLowerCase() === needle.toLowerCase(),
      ),
    [suppliers, needle],
  );

  function supplierHref(supplierId: number) {
    const params = new URLSearchParams({ supplierId: String(supplierId) });
    if (branchId != null) params.set("branchId", String(branchId));
    return `${basePath}?${params.toString()}`;
  }

  async function handleCreate() {
    if (!needle || creating || !canCreate) return;
    setCreating(true);
    setError(null);
    const res = await createSupplier({ name: needle });
    if (!res.success) {
      setError(res.error ?? INVENTORY_VI.grnCreateSupplierFailed);
      setCreating(false);
      return;
    }
    const id = (res.data as { id: number } | undefined)?.id;
    if (id == null) {
      setError(INVENTORY_VI.grnCreateSupplierFailed);
      setCreating(false);
      return;
    }
    router.push(supplierHref(id));
  }

  return (
    <div className="flex flex-col gap-3">
      <InputGroup className="h-12">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label={INVENTORY_VI.supplierSearchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={INVENTORY_VI.supplierSearchPlaceholder}
          className="text-base"
          inputMode="search"
        />
      </InputGroup>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {needle && !hasExactMatch && canCreate ? (
        <InteractiveCard
          minHeight="mobile"
          padding="default"
          className="border-primary/20 bg-primary/10 text-left"
          render={
            <button type="button" onClick={handleCreate} disabled={creating} />
          }
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            {creating ? (
              <Spinner className="size-5" />
            ) : (
              <IconPlus className="size-5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight text-primary">
              {creating
                ? INVENTORY_VI.grnCreateSupplierPending
                : INVENTORY_VI.grnCreateSupplierInline(needle)}
            </p>
          </div>
        </InteractiveCard>
      ) : null}

      {filtered.length === 0 && !needle ? (
        <AppEmptyState
          compact
          icon={<IconUsers />}
          title={INVENTORY_VI.noSupplierTitle}
          description={INVENTORY_VI.noSupplierDescription}
        />
      ) : filtered.length === 0 && !canCreate ? (
        <AppEmptyState
          compact
          icon={<IconSearch />}
          title={INVENTORY_VI.supplierNotFound}
        />
      ) : (
        filtered.map((supplier) => {
          const initials = supplier.name.slice(0, 2).toUpperCase();
          return (
            <InteractiveCard
              key={supplier.id}
              minHeight="mobile"
              padding="default"
              className="h-auto"
              render={<Link href={supplierHref(supplier.id)} />}
            >
              <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold uppercase text-muted-foreground">
                {initials}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold leading-tight">
                  {supplier.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {supplier.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <IconPhone className="size-3" />
                      {supplier.phone}
                    </span>
                  ) : null}
                  {supplier.recentLabel ? (
                    <span className="inline-flex items-center gap-1">
                      <IconReceipt className="size-3" />
                      {supplier.recentLabel}
                    </span>
                  ) : null}
                  {supplier.lastLabel ? (
                    <span>{supplier.lastLabel}</span>
                  ) : null}
                </div>
              </div>
              <IconChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </InteractiveCard>
          );
        })
      )}
    </div>
  );
}
