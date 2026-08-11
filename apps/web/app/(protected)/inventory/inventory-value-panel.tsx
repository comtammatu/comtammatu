"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw as IconRefresh } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Item,
  ItemContent,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import {
  fetchInventoryValueByBranch,
  fetchInventoryValueSystem,
} from "./inventory-value-actions";
import { messages } from "@lib/messages";
import { AppEmptyState, AppPageHeader, AppSection } from "@/components/surface";

import { BRANCH_VI } from "@comtammatu/shared/messages";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
interface InventoryValuePanelProps {
  visibility: InventoryValueVisibility;
}

type BranchValueRow = {
  branchId: number;
  branchName: string;
  totalValue: number;
};

export function InventoryValuePanel({ visibility }: InventoryValuePanelProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const [systemTotal, setSystemTotal] = useState<number | null>(null);
  const [branchRows, setBranchRows] = useState<BranchValueRow[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const loadSystem = useCallback(() => {
    startTransition(async () => {
      const res = await fetchInventoryValueSystem();
      if (!res.success) {
        toast.error(res.error ?? messages.inventory.value.loadFailed);
        return;
      }
      setSystemTotal(res.data?.totalValue ?? 0);
    });
  }, []);

  const loadBranch = useCallback(() => {
    startTransition(async () => {
      const res = await fetchInventoryValueByBranch();
      if (!res.success) {
        toast.error(res.error ?? messages.inventory.value.loadFailed);
        return;
      }
      setBranchRows(res.data?.rows ?? []);
    });
  }, []);

  useEffect(() => {
    if (visibility.system) loadSystem();
    if (visibility.branch) loadBranch();
  }, [
    visibility.system,
    visibility.branch,
    loadSystem,
    loadBranch,
  ]);

  const refreshAll = () => {
    if (visibility.system) loadSystem();
    if (visibility.branch) loadBranch();
  };

  if (!visibility.system && !visibility.branch) {
    return null;
  }

  const defaultTab = visibility.system ? "system" : "branch";

  const tabCount = [visibility.system, visibility.branch].filter(
    Boolean,
  ).length;
  const branchTotal =
    branchRows?.reduce((sum, row) => sum + Number(row.totalValue), 0) ?? 0;

  const branchColumns: DataTableColumn<BranchValueRow>[] = [
    {
      key: "branch",
      header: BRANCH_VI.long,
      render: (row) => <span className="font-medium">{row.branchName}</span>,
    },
    {
      key: "value",
      header: messages.inventory.value.inventoryValue,
      className: "text-right",
      render: (row) => (
        <span className="font-mono tabular-nums">
          {formatVND(row.totalValue)}
        </span>
      ),
    },
  ];

  return (
    <Tabs defaultValue={defaultTab} className="gap-4">
      <div className="flex flex-col gap-3">
        <AppPageHeader
          title={messages.inventory.value.title}
          actions={
            <Button
              variant="ghost"
              size={isTouchLayout ? "touch" : "lg"}
              onClick={refreshAll}
              disabled={isPending}
              className="gap-1.5 text-muted-foreground"
            >
              {isPending ? <Spinner /> : <IconRefresh className="size-4" />}
              {APP_COPY_VI.refresh}
            </Button>
          }
        />
        <div className="flex items-center gap-2">
          {tabCount > 1 && (
            <TabsList variant="toolbar" size={isTouchLayout ? "touch" : "default"} className="w-fit">
              {visibility.system && (
                <TabsTrigger value="system">
                  {messages.inventory.value.tabs.system}
                </TabsTrigger>
              )}
              {visibility.branch && (
                <TabsTrigger value="branch">
                  {messages.inventory.value.tabs.branch}
                </TabsTrigger>
              )}
            </TabsList>
          )}
        </div>
      </div>

      {visibility.system && (
        <TabsContent value="system">
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryBlock
              label={messages.inventory.value.currentValue}
              value={systemTotal == null ? "—" : formatVND(systemTotal)}
            />
            <SummaryBlock
              label={messages.inventory.value.viewScope}
              value={messages.inventory.value.systemScope}
              hint={messages.inventory.value.systemDescription}
              valueClassName="text-base"
            />
          </div>
        </TabsContent>
      )}

      {visibility.branch && (
        <TabsContent value="branch">
          {branchRows == null ? (
            <p className="text-sm text-muted-foreground">
              {APP_COPY_VI.loading}
            </p>
          ) : branchRows.length === 0 ? (
            <AppEmptyState
              compact
              title={APP_COPY_VI.noScopedBranches}
              symbol="riceGrain"
            />
          ) : (
            <AppSection
              title={messages.inventory.value.tabs.branch}
              badge={{
                children: `${branchRows.length} chi nhánh`,
                variant: "secondary",
              }}
              contentFlush
              contentClassName="gap-1"
            >
              <div className="border-b p-4">
                <SummaryBlock
                  label={messages.inventory.value.branchTotal}
                  value={formatVND(branchTotal)}
                />
              </div>
              <DataTable
                columns={branchColumns}
                data={branchRows}
                getRowKey={(row) => row.branchId}
                mobileCardRender={(row) => <BranchValueItem row={row} />}
              />
            </AppSection>
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}

function SummaryBlock({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string;
  value: string;
  hint?: string;
  valueClassName?: string;
}) {
  return (
    <Frame className="bg-muted/30 p-4">
      <SectionLabel className="text-muted-foreground/70">
        {label}
      </SectionLabel>
      <p
        className={`mt-2 font-semibold tracking-tight tabular-nums ${valueClassName ?? "text-2xl"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </Frame>
  );
}

function BranchValueItem({ row }: { row: BranchValueRow }) {
  return (
    <Item variant="outline">
      <ItemHeader>
        <ItemTitle>{row.branchName}</ItemTitle>
      </ItemHeader>
      <ItemContent>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {formatVND(row.totalValue)}
        </span>
      </ItemContent>
    </Item>
  );
}
