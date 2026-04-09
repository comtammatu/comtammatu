"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import {
  fetchInventoryValueByArea,
  fetchInventoryValueByBranch,
  fetchInventoryValueSystem,
} from "./inventory-value-actions";
import { EmptyStatePanel } from "../components/empty-state-panel";

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

  return (
    <Tabs defaultValue={defaultTab}>
      {/* Header: title + tabs (inline) + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Giá trị tồn kho</h2>
        <div className="flex items-center gap-2">
          {tabCount > 1 && (
            <TabsList>
              {visibility.system && (
                <TabsTrigger value="system">Toàn hệ thống</TabsTrigger>
              )}
              {visibility.area && (
                <TabsTrigger value="area">Theo khu vực</TabsTrigger>
              )}
              {visibility.branch && (
                <TabsTrigger value="branch">Theo chi nhánh</TabsTrigger>
              )}
            </TabsList>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshAll}
            disabled={isPending}
            className="gap-1.5 text-muted-foreground"
          >
            <RefreshCw
              className={`size-4 ${isPending ? "animate-spin" : ""}`}
            />
            Làm mới
          </Button>
        </div>
      </div>

      {/* System */}
      {visibility.system && (
        <TabsContent value="system" className="mt-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {systemTotal == null ? "—" : formatVND(systemTotal)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tổng giá trị tồn kho tất cả chi nhánh (theo WAC / giá tham
                chiếu)
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {/* Area */}
      {visibility.area && (
        <TabsContent value="area" className="mt-3">
          {areaRows == null ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : areaRows.length === 0 ? (
            <EmptyStatePanel
              className="py-10"
              title="Không có dữ liệu khu vực"
            />
          ) : isMobile ? (
            <div className="overflow-hidden rounded-lg border shadow-sm divide-y">
              {areaRows.map((r) => (
                <div
                  key={r.areaId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="text-sm font-medium truncate">
                    {r.areaName}
                  </span>
                  <span className="text-sm font-mono tabular-nums shrink-0">
                    {formatVND(r.totalValue)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Khu vực
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Giá trị tồn kho
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areaRows.map((r) => (
                    <TableRow key={r.areaId}>
                      <TableCell className="font-medium">
                        {r.areaName}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVND(r.totalValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      )}

      {/* Branch */}
      {visibility.branch && (
        <TabsContent value="branch" className="mt-3">
          {branchRows == null ? (
            <p className="text-sm text-muted-foreground">Đang tải…</p>
          ) : branchRows.length === 0 ? (
            <EmptyStatePanel
              className="py-10"
              title="Không có chi nhánh trong phạm vi"
            />
          ) : isMobile ? (
            <div className="overflow-hidden rounded-lg border shadow-sm divide-y">
              {branchRows.map((r) => (
                <div
                  key={r.branchId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <span className="text-sm font-medium truncate">
                    {r.branchName}
                  </span>
                  <span className="text-sm font-mono tabular-nums shrink-0">
                    {formatVND(r.totalValue)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">
                      Chi nhánh
                    </TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wider">
                      Giá trị tồn kho
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchRows.map((r) => (
                    <TableRow key={r.branchId}>
                      <TableCell className="font-medium">
                        {r.branchName}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatVND(r.totalValue)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      )}
    </Tabs>
  );
}
