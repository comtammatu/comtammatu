"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ShoppingCart,
  Truck,
} from "lucide-react";
import type { InventoryValueVisibility } from "@comtammatu/shared/auth";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { IngredientTable } from "./ingredient-table";
import { InventoryValuePanel } from "./inventory-value-panel";
import { StockLevelsTable } from "./stock-levels-table";
import type {
  IngredientRow,
  BranchOption,
  ReorderAlertRow,
  ExpiryAlertRow,
} from "./page";
import type { InTransitTransfer } from "./report-actions";

interface InventoryClientProps {
  ingredients: IngredientRow[];
  branches: BranchOption[];
  defaultBranchId: number | null;
  inventoryValueVisibility: InventoryValueVisibility;
  canManageIngredientCatalog: boolean;
  reorderAlerts: ReorderAlertRow[];
  expiryAlerts: ExpiryAlertRow[];
  inTransitTransfers: InTransitTransfer[];
}

export function InventoryClient({
  ingredients,
  branches,
  defaultBranchId,
  inventoryValueVisibility,
  canManageIngredientCatalog,
  reorderAlerts,
  expiryAlerts,
  inTransitTransfers,
}: InventoryClientProps) {
  const [localIngredients, setLocalIngredients] =
    useState<IngredientRow[]>(ingredients);

  const expiredCount = expiryAlerts.filter(
    (a) => a.urgency === "expired",
  ).length;
  const nearExpiryCount = expiryAlerts.filter(
    (a) => a.urgency === "critical" || a.urgency === "warning",
  ).length;

  return (
    <div className="space-y-6">
      {/* Alert Dashboard Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Reorder Alerts Card */}
        <Card
          className={cn(
            reorderAlerts.length > 0
              ? "border-warning bg-warning/5"
              : "border-success bg-success/5",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {reorderAlerts.length > 0 ? (
                <ShoppingCart className="mt-0.5 size-5 shrink-0 text-warning" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Cần đặt hàng</h3>
                {reorderAlerts.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {reorderAlerts.length} nguyên liệu dưới mức đặt hàng
                    </p>
                    <ul className="mt-2 space-y-1">
                      {reorderAlerts.slice(0, 5).map((alert) => (
                        <li
                          key={`${alert.ingredient_id}-${alert.branch_id}`}
                          className="truncate text-sm"
                        >
                          <span className="font-medium">
                            {alert.ingredient_name}
                          </span>
                          :{" "}
                          <span className="tabular-nums">
                            {alert.current_quantity}/{alert.reorder_point}
                          </span>{" "}
                          {alert.unit}
                        </li>
                      ))}
                      {reorderAlerts.length > 5 && (
                        <li className="text-sm text-muted-foreground">
                          ...và {reorderAlerts.length - 5} nguyên liệu khác
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Tồn kho đủ cho tất cả nguyên liệu
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expiry Alerts Card */}
        <Card
          className={cn(
            expiredCount > 0
              ? "border-destructive bg-destructive/5"
              : nearExpiryCount > 0
                ? "border-warning bg-warning/5"
                : "border-success bg-success/5",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              {expiryAlerts.length > 0 ? (
                <Clock
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    expiredCount > 0 ? "text-destructive" : "text-warning",
                  )}
                />
              ) : (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Hạn sử dụng</h3>
                {expiryAlerts.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {expiredCount > 0 && `${expiredCount} hết hạn`}
                      {expiredCount > 0 && nearExpiryCount > 0 && ", "}
                      {nearExpiryCount > 0 && `${nearExpiryCount} sắp hết hạn`}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {expiryAlerts.slice(0, 5).map((alert, idx) => (
                        <li
                          key={`${alert.ingredient_name}-${alert.grn_number}-${String(idx)}`}
                          className="truncate text-sm"
                        >
                          <span className="font-medium">
                            {alert.ingredient_name}
                          </span>{" "}
                          &mdash;{" "}
                          {alert.days_remaining <= 0 ? (
                            <span className="font-medium text-destructive">
                              Đã hết hạn
                            </span>
                          ) : (
                            <span className="tabular-nums">
                              {alert.days_remaining} ngày
                            </span>
                          )}
                        </li>
                      ))}
                      {expiryAlerts.length > 5 && (
                        <li className="text-sm text-muted-foreground">
                          ...và {expiryAlerts.length - 5} mục khác
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Không có hàng sắp hết hạn
                  </p>
                )}
              </div>
            </div>
            {expiryAlerts.length > 0 && (
              <Link
                href="/admin/inventory/expiry"
                className="mt-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Xem chi tiết
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>

        {/* In-Transit Card */}
        <Card
          className={cn(
            inTransitTransfers.length > 0
              ? "border-blue-400 bg-blue-50/50 dark:bg-blue-950/20"
              : "border-success bg-success/5",
          )}
        >
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Truck
                className={cn(
                  "mt-0.5 size-5 shrink-0",
                  inTransitTransfers.length > 0
                    ? "text-blue-600"
                    : "text-success",
                )}
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">Đang vận chuyển</h3>
                {inTransitTransfers.length > 0 ? (
                  <>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {inTransitTransfers.length} phiếu đang trên đường
                    </p>
                    <ul className="mt-2 space-y-1">
                      {inTransitTransfers.slice(0, 3).map((t) => (
                        <li key={t.id} className="truncate text-sm">
                          <span className="font-medium font-mono">
                            {t.transfer_number}
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {t.from_branch_name} → {t.to_branch_name}
                          </span>
                        </li>
                      ))}
                      {inTransitTransfers.length > 3 && (
                        <li className="text-sm text-muted-foreground">
                          ...và {inTransitTransfers.length - 3} phiếu khác
                        </li>
                      )}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Không có hàng đang vận chuyển
                  </p>
                )}
              </div>
            </div>
            {inTransitTransfers.length > 0 && (
              <Link
                href="/admin/inventory/transfers?status=in_transit"
                className="mt-3 flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                Xem tất cả
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Existing Tabs */}
      <Tabs defaultValue="ingredients">
        <TabsList>
          <TabsTrigger value="ingredients">
            Nguyên liệu ({localIngredients.length})
          </TabsTrigger>
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
        </TabsList>

        <TabsContent value="ingredients" className="mt-4 space-y-4">
          <IngredientTable
            ingredients={localIngredients}
            canManageCatalog={canManageIngredientCatalog}
            onIngredientAdded={(ing) =>
              setLocalIngredients((prev) => [...prev, ing])
            }
            onIngredientUpdated={(updated) =>
              setLocalIngredients((prev) =>
                prev.map((i) => (i.id === updated.id ? updated : i)),
              )
            }
          />
        </TabsContent>

        <TabsContent value="stock" className="mt-4 space-y-6">
          <InventoryValuePanel visibility={inventoryValueVisibility} />
          <StockLevelsTable
            ingredients={localIngredients}
            branches={branches}
            defaultBranchId={defaultBranchId}
            showLineValue={inventoryValueVisibility.branch}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
