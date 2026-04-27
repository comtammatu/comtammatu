"use client";

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
import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import type { DashboardLocation } from "../dashboard-actions";

import { FORM_VI } from "@comtammatu/shared/messages";
const LOCATION_KIND_VI: Record<string, string> = {
  warehouse: "Kho",
  kitchen: "Bếp",
  production_storage: "Kho sản xuất",
  consumption: "Tiêu thụ",
  other: "Khác",
};

interface LocationBreakdownTableProps {
  locations: DashboardLocation[];
  canViewCost: boolean;
  className?: string;
}

/**
 * Per-location breakdown table (S12).
 * Shows every inventory_location of a branch with SKU count, qty, value (cost-gated),
 * and alerts count. Rows sorted by value desc when cost visible, else by SKU count.
 */
export function LocationBreakdownTable({
  locations,
  canViewCost,
  className,
}: LocationBreakdownTableProps) {
  const sorted = [...locations].sort((a, b) => {
    if (canViewCost) {
      return (b.totalValueVnd ?? 0) - (a.totalValueVnd ?? 0);
    }
    return b.skuCount - a.skuCount;
  });

  const totalValue = sorted.reduce(
    (sum, l) => sum + Number(l.totalValueVnd ?? 0),
    0,
  );
  const totalAlerts = sorted.reduce((sum, l) => sum + l.alertsCount, 0);

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="text-base">Theo location</CardTitle>
        <CardDescription>
          {sorted.length} location
          {totalAlerts > 0 ? ` • ${totalAlerts} alert đang hoạt động` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có dữ liệu tồn kho.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">SKU</TableHead>
                <TableHead className="text-right">{FORM_VI.quantity}</TableHead>
                {canViewCost ? (
                  <TableHead className="text-right">{FORM_VI.value}</TableHead>
                ) : null}
                <TableHead className="text-right">Alert</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((loc) => (
                <TableRow key={loc.locationId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{loc.locationName}</span>
                      <span className="text-xs text-muted-foreground">
                        {LOCATION_KIND_VI[loc.locationKind] ?? loc.locationKind}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {loc.skuCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {loc.totalQuantity.toLocaleString("vi-VN")}
                  </TableCell>
                  {canViewCost ? (
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatVND(loc.totalValueVnd ?? 0)}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    {loc.alertsCount > 0 ? (
                      <Badge
                        variant="outline"
                        className="bg-tier-note/15 text-tier-note-foreground border-tier-note/40"
                      >
                        {loc.alertsCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {canViewCost && sorted.length > 1 ? (
                <TableRow className="font-semibold">
                  <TableCell>{FORM_VI.total}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {sorted.reduce((s, l) => s + l.skuCount, 0)}
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right tabular-nums">
                    {formatVND(totalValue)}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalAlerts > 0 ? (
                      <Badge variant="outline">{totalAlerts}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
