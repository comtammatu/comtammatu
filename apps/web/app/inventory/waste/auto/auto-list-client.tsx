"use client";

import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import {
  IconShoppingCartX,
  IconFlame,
  IconChefHat,
  IconExternalLink,
} from "@tabler/icons-react";
import { InventoryHeader } from "../../_components/inventory-header";
import { InventoryPageContent } from "../../_components/inventory-page-layout";

interface AutoWasteItem {
  id: number;
  ingredientName: string;
  quantity: number;
  unit: string;
  totalCost: number;
  reasonCode: string | null;
}

interface AutoWasteRow {
  id: number;
  issuedAt: string;
  sourceType: string;
  sourceRef: Record<string, unknown> | null;
  approvalStatus: string;
  notes: string | null;
  items: AutoWasteItem[];
}

interface Props {
  branchId: number;
  rows: AutoWasteRow[];
}

const SOURCE_LABEL_VI: Record<string, { label: string; tone: string }> = {
  pos_return: {
    label: "POS trả khách",
    tone: "border-red-300 bg-red-50 text-red-900",
  },
  kds_cancel_mid_cook: {
    label: "KDS hủy giữa chừng",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
  },
  kds_cancel_after_cook: {
    label: "KDS hủy sau khi nấu",
    tone: "border-orange-300 bg-orange-50 text-orange-900",
  },
};

const APPROVAL_LABEL_VI: Record<string, string> = {
  not_required: "Không cần duyệt",
  pending: "Chờ QLV duyệt",
  approved: "Đã duyệt",
  rejected: "Đã từ chối",
};

/**
 * Auto-generated waste viewer (S11-ext).
 *
 * Read-only list of waste headers produced by `create_waste_from_order`
 * — POS customer returns and KDS mid/after cook cancels. Filter covers
 * last 50 events for the current branch.
 *
 * Each row links to the waste approvals queue when approval is pending
 * so QLV can act in-place.
 */
export function AutoWasteListClient({ branchId, rows }: Props) {
  const totalValue = rows.reduce(
    (sum, r) => sum + r.items.reduce((s, it) => s + it.totalCost, 0),
    0,
  );
  const pending = rows.filter((r) => r.approvalStatus === "pending").length;

  return (
    <>
      <InventoryHeader
        title="Hao hụt phát hiện tự động"
        description={`CN #${branchId} · ${rows.length} phiếu · ${pending} chờ duyệt`}
      />
      <InventoryPageContent>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1">
            Tổng giá trị: {formatVnd(totalValue)}
          </Badge>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href={`/inventory/waste/approvals?branchId=${branchId}`}>
              Xem queue duyệt
            </Link>
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/inventory/waste?branchId=${branchId}`}>
              Về trang waste
            </Link>
          </Button>
        </div>

        {rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <IconShoppingCartX className="size-8 text-muted-foreground/50" />
              <div className="text-sm font-medium">
                Chưa có phiếu waste auto
              </div>
              <div className="text-xs text-muted-foreground">
                POS void hoặc KDS cancel sẽ sinh phiếu tại đây.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <AutoWasteCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </InventoryPageContent>
    </>
  );
}

function AutoWasteCard({ row }: { row: AutoWasteRow }) {
  const src = SOURCE_LABEL_VI[row.sourceType] ?? {
    label: row.sourceType,
    tone: "border-muted bg-muted/40 text-muted-foreground",
  };
  const orderId = row.sourceRef?.["order_id"];
  const value = row.items.reduce((s, it) => s + it.totalCost, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
            {row.sourceType === "pos_return" ? (
              <IconShoppingCartX className="size-4 text-red-600" />
            ) : row.sourceType === "kds_cancel_mid_cook" ? (
              <IconFlame className="size-4 text-amber-600" />
            ) : (
              <IconChefHat className="size-4 text-orange-600" />
            )}
            Phiếu #{row.id}
            <Badge variant="outline" className={cn(src.tone)}>
              {src.label}
            </Badge>
            {orderId !== undefined ? (
              <Badge variant="outline" className="gap-1">
                Order #{String(orderId)}
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                row.approvalStatus === "pending"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : row.approvalStatus === "approved"
                    ? "border-green-300 bg-green-50 text-green-900"
                    : row.approvalStatus === "rejected"
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "",
              )}
            >
              {APPROVAL_LABEL_VI[row.approvalStatus] ?? row.approvalStatus}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(row.issuedAt)}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="space-y-1 text-sm">
          {row.items.map((it) => (
            <li
              key={it.id}
              className="flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {it.ingredientName}
                {it.reasonCode ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    · {it.reasonCode}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">
                {it.quantity} {it.unit}
                <span className="ml-2 text-xs text-muted-foreground">
                  {formatVnd(it.totalCost)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {row.notes ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {row.notes}
          </p>
        ) : null}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs font-medium">
            Tổng: {formatVnd(value)}
          </span>
          {row.approvalStatus === "pending" ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/inventory/waste/approvals">
                <IconExternalLink className="size-3.5" /> Mở queue duyệt
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function formatVnd(n: number): string {
  return n.toLocaleString("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
