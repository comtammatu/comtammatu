"use client";

import {
  useCallback,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { RefreshCw as IconRefresh } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  fetchInventoryValueByArea,
  fetchInventoryValueByBranch,
  fetchInventoryValueSystem,
} from "./inventory-value-actions";
import { messages } from "@lib/messages";

import { BRANCH_VI, TABLE_VI } from "@comtammatu/shared/messages";
interface InventoryValuePanelProps {
  visibility: InventoryValueVisibility;
}

export function InventoryValuePanel({ visibility }: InventoryValuePanelProps) {
  const [systemTotal, setSystemTotal] = useState<number | null>(null);
  const [areaRows, setAreaRows] = useState<
    { areaId: number; areaName: string; totalValue: number }[] | null
  >(null);
  const [branchRows, setBranchRows] = useState<
    { branchId: number; branchName: string; totalValue: number }[] | null
  >(null);
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const loadSystem = useCallback(() => {
    startTransition(async () => {
      const res = await fetchInventoryValueSystem();
      if (!res.success) {
        toast.error(res.error ?? "Không thể tải dữ liệu");
        return;
      }
      setSystemTotal(res.data?.totalValue ?? 0);
    });
  }, []);

  const loadArea = useCallback(() => {
    startTransition(async () => {
      const res = await fetchInventoryValueByArea();
      if (!res.success) {
        toast.error(res.error ?? "Không thể tải dữ liệu");
        return;
      }
      setAreaRows(res.data?.rows ?? []);
    });
  }, []);

  const loadBranch = useCallback(() => {
    startTransition(async () => {
      const res = await fetchInventoryValueByBranch();
      if (!res.success) {
        toast.error(res.error ?? "Không thể tải dữ liệu");
        return;
      }
      setBranchRows(res.data?.rows ?? []);
    });
  }, []);

  useEffect(() => {
    if (visibility.system) loadSystem();
    if (visibility.area) loadArea();
    if (visibility.branch) loadBranch();
  }, [
    visibility.system,
    visibility.area,
    visibility.branch,
    loadSystem,
    loadArea,
    loadBranch,
  ]);

  const refreshAll = () => {
    if (visibility.system) loadSystem();
    if (visibility.area) loadArea();
    if (visibility.branch) loadBranch();
  };

  if (!visibility.system && !visibility.area && !visibility.branch) {
    return null;
  }

  const defaultTab = visibility.system
    ? "system"
    : visibility.area
      ? "area"
      : "branch";

  const tabCount = [
    visibility.system,
    visibility.area,
    visibility.branch,
  ].filter(Boolean).length;
  const areaTotal =
    areaRows?.reduce((sum, row) => sum + Number(row.totalValue), 0) ?? 0;
  const branchTotal =
    branchRows?.reduce((sum, row) => sum + Number(row.totalValue), 0) ?? 0;
  const SummaryBox = ({ children }: { children: ReactNode }) => (
    <Card className="bg-muted/30">
      <CardContent className="px-4 py-4">{children}</CardContent>
    </Card>
  );

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">
              {messages.inventory.value.eyebrow}
            </p>
            <div className="space-y-1">
              <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                {messages.inventory.value.title}
              </h1>
              <p className="text-sm text-muted-foreground">
                {messages.inventory.value.description}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshAll}
            disabled={isPending}
            className="gap-1.5 text-muted-foreground"
          >
            {isPending ? <Spinner /> : <IconRefresh className="size-4" />}
            {APP_COPY_VI.refresh}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {tabCount > 1 && (
            <TabsList variant="toolbar" className="w-fit">
              {visibility.system && (
                <TabsTrigger value="system">
                  {messages.inventory.value.tabs.system}
                </TabsTrigger>
              )}
              {visibility.area && (
                <TabsTrigger value="area">
                  {messages.inventory.value.tabs.area}
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
        <TabsContent value="system" className="mt-3">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {messages.inventory.value.currentValue}
                    </p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
                      {systemTotal == null ? "—" : formatVND(systemTotal)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                      {messages.inventory.value.viewScope}
                    </p>
                    <p className="mt-2 text-base font-semibold">
                      {messages.inventory.value.systemScope}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {messages.inventory.value.systemDescription}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {visibility.area && (
        <TabsContent value="area" className="mt-3">
          {areaRows == null ? (
            <p className="text-sm text-muted-foreground">
              {APP_COPY_VI.loading}
            </p>
          ) : areaRows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-base font-semibold">
                  {APP_COPY_VI.noAreaData}
                </p>
              </CardContent>
            </Card>
          ) : isMobile ? (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <SummaryBox>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {messages.inventory.value.areaTotal}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatVND(areaTotal)}
                  </p>
                </SummaryBox>
                <div className="-m-4 divide-y md:-m-5">
                  {areaRows.map((row) => (
                    <div
                      key={row.areaId}
                      className="flex items-center justify-between gap-3 px-4 py-3 md:px-5"
                    >
                      <span className="truncate text-sm font-medium">
                        {row.areaName}
                      </span>
                      <span className="shrink-0 text-sm font-mono tabular-nums">
                        {formatVND(row.totalValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <SummaryBox>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {messages.inventory.value.areaTotal}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatVND(areaTotal)}
                  </p>
                </SummaryBox>
                <div className="-m-4 md:-m-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">
                          {TABLE_VI.area}
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                          {messages.inventory.value.inventoryValue}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {areaRows.map((row) => (
                        <TableRow key={row.areaId}>
                          <TableCell className="font-medium">
                            {row.areaName}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVND(row.totalValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      )}

      {visibility.branch && (
        <TabsContent value="branch" className="mt-3">
          {branchRows == null ? (
            <p className="text-sm text-muted-foreground">
              {APP_COPY_VI.loading}
            </p>
          ) : branchRows.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <p className="text-base font-semibold">
                  {APP_COPY_VI.noScopedBranches}
                </p>
              </CardContent>
            </Card>
          ) : isMobile ? (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <SummaryBox>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {messages.inventory.value.branchTotal}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatVND(branchTotal)}
                  </p>
                </SummaryBox>
                <div className="-m-4 divide-y md:-m-5">
                  {branchRows.map((row) => (
                    <div
                      key={row.branchId}
                      className="flex items-center justify-between gap-3 px-4 py-3 md:px-5"
                    >
                      <span className="truncate text-sm font-medium">
                        {row.branchName}
                      </span>
                      <span className="shrink-0 text-sm font-mono tabular-nums">
                        {formatVND(row.totalValue)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="space-y-4 pt-6">
                <SummaryBox>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                    {messages.inventory.value.branchTotal}
                  </p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums">
                    {formatVND(branchTotal)}
                  </p>
                </SummaryBox>
                <div className="-m-4 md:-m-5">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-semibold uppercase tracking-wider">
                          {BRANCH_VI.long}
                        </TableHead>
                        <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                          {messages.inventory.value.inventoryValue}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchRows.map((row) => (
                        <TableRow key={row.branchId}>
                          <TableCell className="font-medium">
                            {row.branchName}
                          </TableCell>
                          <TableCell className="text-right font-mono tabular-nums">
                            {formatVND(row.totalValue)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
