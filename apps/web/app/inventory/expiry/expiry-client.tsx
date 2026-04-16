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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { PageHeader, SectionCard } from "@/components/patterns";
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
    <div className="space-y-6">
      <PageHeader
        eyebrow="Shelf Life Radar"
        title="Hạn sử dụng"
        description="Theo dõi lô gần quá hạn, quá hạn và ưu tiên xử lý trong kho theo cùng một nhịp điều phối mới."
        actions={
          <Button type="button" variant="destructive" className="min-h-11 px-5">
            <Trash2 className="size-4" />
            Hủy tất cả hàng đã hết hạn
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
            <AlertOctagon className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-destructive">
            {String(expiredCount).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Mặt hàng đã hết hạn cần khóa xử lý ngay.
          </p>
        </div>

        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/12 text-primary">
            <AlertTriangle className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-primary">
            {String(criticalCount).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Hàng hóa sẽ chạm hạn trong 3 ngày tới.
          </p>
        </div>

        <div className="app-stat">
          <div className="flex size-11 items-center justify-center rounded-full bg-warning/12 text-warning">
            <Clock className="size-5" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-warning">
            {String(warningCount).padStart(2, "0")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhóm cần chuẩn bị kế hoạch xoay vòng trong 7 ngày tới.
          </p>
        </div>
      </div>

      <div className="app-subpanel flex flex-wrap gap-2 p-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <Button
              key={tab}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              onClick={() => setActiveTab(tab)}
              className={cn("flex-1 rounded-full", isActive && "font-semibold shadow-sm")}
            >
              {tab === "Tất cả" ? "Tất cả" : tStatus(tab, "tab")}
            </Button>
          );
        })}
      </div>

      <SectionCard
        title="Danh sách cảnh báo theo lô"
        description="Ưu tiên theo số ngày còn lại, chứng từ nhập và chi nhánh sở hữu."
        className="overflow-hidden"
        density="compact"
      >
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
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="app-panel border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <Lightbulb className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="app-kicker">Gợi ý tối ưu hóa</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Dựa trên dữ liệu 30 ngày qua, tỷ lệ hàng quá hạn tại CN Quận 1
                cao hơn 15% so với trung bình. Hệ thống đề xuất điều chuyển
                nguyên liệu sớm sang các chi nhánh có lượng tiêu thụ cao hơn.
              </p>
            </div>
          </div>
        </div>
        <div className="app-panel">
          <p className="app-kicker">Thông báo tự động</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Cài đặt nhắc báo qua Email hoặc Zalo cho quản lý kho khi hàng hóa
            còn dưới 5 ngày sử dụng.
          </p>
          <div className="mt-4 flex items-center gap-2 text-success">
            <Bell className="size-4" />
            <span className="text-xs font-medium">Đã bật Email</span>
          </div>
        </div>
      </div>
    </div>
  );
}
