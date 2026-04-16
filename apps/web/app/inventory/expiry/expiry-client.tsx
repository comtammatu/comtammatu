"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
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
import { InventoryHeader } from "../_components/inventory-header";
import { tStatus } from "../_lib/dictionary";

export type ExpiryAlertRow = {
  id: number;
  ingredientName: string;
  lot: string;
  expiryDate: string;
  daysLeft: number;
  urgency: string;
  grnCode: string;
  branchName: string;
};

const tabs = ["Tất cả", "expired", "critical", "warning"] as const;

function getUrgencyBadgeVariant(urgency: string) {
  if (urgency === "expired") {
    return "destructive" as const;
  }
  if (urgency === "critical") {
    return "default" as const;
  }
  return "warning" as const;
}

export function ExpiryClient({ alerts }: { alerts: ExpiryAlertRow[] }) {
  const [activeTab, setActiveTab] = useState<string>("Tất cả");
  const filtered =
    activeTab === "Tất cả"
      ? alerts
      : alerts.filter((e) => e.urgency === activeTab);
  const expiredCount = alerts.filter((e) => e.urgency === "expired").length;
  const criticalCount = alerts.filter((e) => e.urgency === "critical").length;
  const warningCount = alerts.filter((e) => e.urgency === "warning").length;

  return (
    <>
      <InventoryHeader title="Hạn sử dụng" />
      <div className="flex-1 overflow-auto p-4">
      <div className="mx-auto max-w-7xl space-y-4">

      {/* Urgency filter buttons */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Button
              key={tab}
              type="button"
              size="sm"
              variant={isActive ? "default" : "outline"}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "Tất cả" ? "Tất cả" : tStatus(tab, "tab")}
              {tab === "expired" && <span className="text-xs opacity-80">{expiredCount}</span>}
              {tab === "critical" && <span className="text-xs opacity-80">{criticalCount}</span>}
              {tab === "warning" && <span className="text-xs opacity-80">{warningCount}</span>}
            </Button>
          );
        })}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nguyên liệu</TableHead>
                <TableHead>Số lô</TableHead>
                <TableHead>Ngày hết hạn</TableHead>
                <TableHead className="text-center">Ngày còn lại</TableHead>
                <TableHead>Phiếu nhập</TableHead>
                <TableHead>Chi nhánh</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-sm font-semibold">
                    {item.ingredientName}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-muted-foreground">
                    {item.lot}
                  </TableCell>
                  <TableCell className="text-sm">{item.expiryDate}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={getUrgencyBadgeVariant(item.urgency)}>
                      {item.daysLeft <= 0
                        ? `Đã hết hạn ${Math.abs(item.daysLeft)} ngày`
                        : `Còn ${item.daysLeft} ngày`}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm text-primary">
                    {item.grnCode}
                  </TableCell>
                  <TableCell className="text-sm">{item.branchName}</TableCell>
                  <TableCell className="text-right">
                    {item.urgency === "expired" ? (
                      <Button variant="destructive" size="sm" className="gap-1">
                        <Trash2 className="size-3" /> Hủy hàng
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm">
                        Chi tiết
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
    </div>
    </>
  );
}
