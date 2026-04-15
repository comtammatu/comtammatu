"use client";

import { useState, useTransition } from "react";
import {
  EmptyState,
  SectionCard,
  StatusBadge,
} from "@/components/foundation/ui-patterns";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { toast } from "@comtammatu/ui/components/sonner";
import { CircleOff, Loader2, Plus, RefreshCw } from "lucide-react";
import type { AccountRow } from "./page";
import {
  seedChartOfAccounts,
  fetchChartOfAccounts,
  toggleAccountActive,
} from "../chart-of-accounts-actions";

const TYPE_LABELS: Record<string, string> = {
  asset: "Tài sản",
  liability: "Nợ phải trả",
  equity: "Vốn CSH",
  revenue: "Doanh thu",
  expense: "Chi phí",
};

const TYPE_COLORS: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  asset: "info",
  liability: "danger",
  equity: "info",
  revenue: "success",
  expense: "warning",
};

interface ChartOfAccountsClientProps {
  initialAccounts: AccountRow[];
}

export function ChartOfAccountsClient({
  initialAccounts,
}: ChartOfAccountsClientProps) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [isPending, startTransition] = useTransition();

  function handleSeed() {
    startTransition(async () => {
      const result = await seedChartOfAccounts();
      if (result.success) {
        toast.success("Đã khởi tạo hệ thống tài khoản VAS");
        // Reload accounts
        const reload = await fetchChartOfAccounts();
        if (reload.success) {
          setAccounts((reload.data ?? []) as AccountRow[]);
        }
      } else {
        toast.error(result.error ?? "Lỗi khởi tạo");
      }
    });
  }

  function handleToggle(accountId: number) {
    startTransition(async () => {
      const result = await toggleAccountActive(accountId);
      if (result.success) {
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === accountId
              ? {
                  ...a,
                  is_active:
                    (result.data as { is_active: boolean })?.is_active ??
                    !a.is_active,
                }
              : a,
          ),
        );
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<CircleOff className="size-8" />}
        title="Chưa có hệ thống tài khoản"
        description="Khởi tạo VAS để bắt đầu hạch toán."
        action={
          <Button onClick={handleSeed} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Khởi tạo hệ thống tài khoản VAS
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card shadow-sm flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Danh mục tài khoản</p>
          <p className="text-sm text-muted-foreground">{accounts.length} tài khoản.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSeed}
          disabled={isPending}
        >
          <RefreshCw className="mr-2 size-4" />
          Kiểm tra thiếu
        </Button>
      </div>

      <SectionCard className="overflow-hidden rounded-lg" density="compact">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Mã TK</TableHead>
              <TableHead>Tên tài khoản</TableHead>
              <TableHead className="w-32">Loại</TableHead>
              <TableHead className="w-24 text-center">Trạng thái</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow
                key={account.id}
                className={!account.is_active ? "opacity-50" : undefined}
              >
                <TableCell className="font-mono font-medium">
                  <span
                    style={{ paddingLeft: `${(account.level - 1) * 16}px` }}
                  >
                    {account.account_code}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    style={{ paddingLeft: `${(account.level - 1) * 16}px` }}
                  >
                    {account.account_name}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={TYPE_COLORS[account.account_type] ?? "neutral"}
                  >
                    {TYPE_LABELS[account.account_type] ?? account.account_type}
                  </StatusBadge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={account.is_active ? "default" : "secondary"}>
                    {account.is_active ? "Hoạt động" : "Tắt"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(account.id)}
                    disabled={isPending}
                  >
                    {account.is_active ? "Tắt" : "Bật"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </div>
  );
}
