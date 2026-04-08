"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
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

  const inner = (
    <>
      {visibility.system && (
        <TabsContent value="system" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Toàn hệ thống</CardTitle>
                <CardDescription>
                  Tổng giá trị tồn kho tất cả chi nhánh (theo WAC / giá tham
                  chiếu)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={loadSystem}
                disabled={isPending}
                title="Làm mới"
              >
                <RefreshCw
                  className={`size-4 ${isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {systemTotal == null ? "—" : formatVND(systemTotal)}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {visibility.area && (
        <TabsContent value="area" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Theo khu vực</CardTitle>
                <CardDescription>
                  Giá trị tồn kho gom theo khu vực đã gán
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={loadArea}
                disabled={isPending}
                title="Làm mới"
              >
                <RefreshCw
                  className={`size-4 ${isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </CardHeader>
            <CardContent>
              {areaRows == null ? (
                <p className="text-sm text-muted-foreground">Đang tải…</p>
              ) : areaRows.length === 0 ? (
                <EmptyStatePanel
                  className="bg-transparent py-10"
                  title="Không có dữ liệu khu vực"
                />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Khu vực</TableHead>
                        <TableHead className="text-right">
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
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {visibility.branch && (
        <TabsContent value="branch" className="mt-0">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Theo chi nhánh</CardTitle>
                <CardDescription>
                  Giá trị tồn kho từng chi nhánh
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={loadBranch}
                disabled={isPending}
                title="Làm mới"
              >
                <RefreshCw
                  className={`size-4 ${isPending ? "animate-spin" : ""}`}
                />
              </Button>
            </CardHeader>
            <CardContent>
              {branchRows == null ? (
                <p className="text-sm text-muted-foreground">Đang tải…</p>
              ) : branchRows.length === 0 ? (
                <EmptyStatePanel
                  className="bg-transparent py-10"
                  title="Không có chi nhánh trong phạm vi"
                />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chi nhánh</TableHead>
                        <TableHead className="text-right">
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
            </CardContent>
          </Card>
        </TabsContent>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-lg font-semibold">Giá trị tồn kho</h2>
        {tabCount > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={refreshAll}
            disabled={isPending}
            className="text-muted-foreground"
          >
            <RefreshCw
              className={`mr-2 size-4 ${isPending ? "animate-spin" : ""}`}
            />
            Làm mới tất cả
          </Button>
        )}
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={tabCount <= 1 ? "hidden" : ""}>
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
        {inner}
      </Tabs>
    </div>
  );
}
