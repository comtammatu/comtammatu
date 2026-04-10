"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
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
import { EmptyStatePanel } from "../admin/components/empty-state-panel";

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
        <h2
          className="text-lg font-semibold"
          style={{ color: "var(--md-on-surface)" }}
        >
          Giá trị tồn kho
        </h2>
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
          <div
            className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl"
            style={{
              background:
                "linear-gradient(135deg, var(--md-primary), var(--md-primary-container))",
            }}
          >
            <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10 blur-3xl" />
            <p
              className="text-xs font-semibold uppercase tracking-widest mb-3"
              style={{ opacity: 0.7 }}
            >
              Tổng giá trị tồn kho
            </p>
            <p className="text-3xl font-extrabold tracking-tighter tabular-nums">
              {systemTotal == null ? "—" : formatVND(systemTotal)}
              <span className="ml-1 text-lg font-medium opacity-80">₫</span>
            </p>
            <p className="mt-2 text-xs font-medium" style={{ opacity: 0.6 }}>
              Tất cả chi nhánh (theo WAC / giá tham chiếu)
            </p>
          </div>
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
            <div
              className="overflow-hidden rounded-2xl ambient-shadow divide-y"
              style={{
                backgroundColor: "var(--md-surface-lowest)",
                border:
                  "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              {areaRows.map((r) => (
                <div
                  key={r.areaId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
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
            <div
              className="overflow-hidden rounded-3xl ambient-shadow"
              style={{
                backgroundColor: "var(--md-surface-lowest)",
                border:
                  "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <Table>
                <TableHeader>
                  <TableRow
                    className="hover:bg-transparent"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    }}
                  >
                    <TableHead
                      className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Khu vực
                    </TableHead>
                    <TableHead
                      className="text-right px-6 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Giá trị tồn kho
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {areaRows.map((r) => (
                    <TableRow
                      key={r.areaId}
                      className="group transition-colors"
                      style={{
                        borderColor:
                          "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                      }}
                    >
                      <TableCell className="px-6 py-4 font-medium">
                        {r.areaName}
                      </TableCell>
                      <TableCell className="text-right px-6 font-mono tabular-nums">
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
            <div
              className="overflow-hidden rounded-2xl ambient-shadow divide-y"
              style={{
                backgroundColor: "var(--md-surface-lowest)",
                border:
                  "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              {branchRows.map((r) => (
                <div
                  key={r.branchId}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  style={{
                    borderColor:
                      "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                  }}
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
            <div
              className="overflow-hidden rounded-3xl ambient-shadow"
              style={{
                backgroundColor: "var(--md-surface-lowest)",
                border:
                  "1px solid color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
              }}
            >
              <Table>
                <TableHeader>
                  <TableRow
                    className="hover:bg-transparent"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--md-surface-low) 50%, transparent)",
                    }}
                  >
                    <TableHead
                      className="px-6 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Chi nhánh
                    </TableHead>
                    <TableHead
                      className="text-right px-6 py-4 text-xs font-bold uppercase tracking-widest"
                      style={{ color: "var(--md-outline)" }}
                    >
                      Giá trị tồn kho
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branchRows.map((r) => (
                    <TableRow
                      key={r.branchId}
                      className="group transition-colors"
                      style={{
                        borderColor:
                          "color-mix(in srgb, var(--md-outline-variant) 10%, transparent)",
                      }}
                    >
                      <TableCell className="px-6 py-4 font-medium">
                        {r.branchName}
                      </TableCell>
                      <TableCell className="text-right px-6 font-mono tabular-nums">
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
