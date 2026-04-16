"use client";

import { useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Clock,
  Lightbulb,
  Trash2,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { tStatus } from "../_lib/dictionary";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";

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
    <div className="space-y-6">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Card className="flex-1 border-border/70">
          <CardHeader>
            <CardTitle className="text-2xl">Hạn sử dụng</CardTitle>
            <CardDescription>
              Theo dõi lô gần quá hạn, quá hạn và ưu tiên xử lý trong kho.
            </CardDescription>
          </CardHeader>
        </Card>
        <Button
          type="button"
          variant="destructive"
          className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-5 py-2.5 font-bold"
        >
          <Trash2 className="size-4 shrink-0" />
          Hủy tất cả hàng đã hết hạn
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/12">
                <AlertOctagon className="size-5 text-destructive" />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Quá hạn
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-destructive">
              {String(expiredCount).padStart(2, "0")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Mặt hàng đã hết hạn
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
                <AlertTriangle className="size-5 text-primary" />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                3 ngày tới
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-primary">
              {String(criticalCount).padStart(2, "0")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Hết hạn trong 3 ngày tới
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex size-10 items-center justify-center rounded-xl bg-warning/12">
                <Clock className="size-5 text-warning" />
              </div>
              <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                7 ngày tới
              </span>
            </div>
            <h3 className="text-3xl font-black tracking-tight text-warning">
              {String(warningCount).padStart(2, "0")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Hết hạn trong 7 ngày tới
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Button
              key={tab}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 rounded-xl",
                isActive && "font-bold shadow-sm",
              )}
            >
              {tab === "Tất cả" ? "Tất cả" : tStatus(tab, "tab")}
            </Button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              {[
                "Nguyên liệu",
                "Số lô",
                "Ngày hết hạn",
                "Ngày còn lại",
                "Phiếu nhập",
                "Chi nhánh",
                "Thao tác",
              ].map((h) => (
                <TableHead
                  key={h}
                  className={`px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground ${h === "Ngày còn lại" ? "text-center" : ""} ${h === "Thao tác" ? "text-right" : ""}`}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id} className="transition-colors">
                <TableCell className="px-6 py-5 text-sm font-semibold">
                  {item.ingredientName}
                </TableCell>
                <TableCell className="px-6 py-5 font-mono text-sm text-muted-foreground">
                  {item.lot}
                </TableCell>
                <TableCell className="px-6 py-5 text-sm">
                  {item.expiryDate}
                </TableCell>
                <TableCell className="px-6 py-5 text-center">
                  <Badge variant={getUrgencyBadgeVariant(item.urgency)}>
                    {item.daysLeft <= 0
                      ? `Đã hết hạn ${Math.abs(item.daysLeft)} ngày`
                      : `Còn ${item.daysLeft} ngày`}
                  </Badge>
                </TableCell>
                <TableCell className="px-6 py-5 font-mono text-sm text-primary">
                  {item.grnCode}
                </TableCell>
                <TableCell className="px-6 py-5 text-sm">
                  {item.branchName}
                </TableCell>
                <TableCell className="px-6 py-5 text-right">
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
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex items-start gap-3 p-4">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Gợi ý tối ưu hóa</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dựa trên dữ liệu 30 ngày qua, tỷ lệ hàng quá hạn tại CN Quận 1 cao
                hơn 15% so với trung bình. Hệ thống đề xuất điều chuyển nguyên
                liệu sớm sang các chi nhánh có lượng tiêu thụ cao hơn.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <p className="text-sm font-semibold">Thông báo tự động</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cài đặt nhắc báo qua Email hoặc Zalo cho quản lý kho khi hàng hóa
              còn dưới 5 ngày sử dụng.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Bell className="size-4 text-success" />
              <span className="text-xs font-medium text-success">
                Đã bật Email
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
