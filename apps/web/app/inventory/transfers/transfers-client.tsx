"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { IconArrowRight, IconPlus, IconSearch, IconTruck } from "@tabler/icons-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { InventoryHeader } from "../_components/inventory-header";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";
import {
  getInventoryStatusBadgeVariant,
  getInventoryStatusLabel,
} from "../_lib/ui";

export type TransferRow = {
  id: number;
  code: string;
  fromBranch: string;
  toBranch: string;
  status: string;
  date: string;
};

export function TransfersClient({ transfers }: { transfers: TransferRow[] }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const statusCounts = useMemo(() => ({
    all: transfers.length,
    draft: transfers.filter((t) => t.status === "draft").length,
    in_transit: transfers.filter((t) => t.status === "in_transit").length,
    confirmed: transfers.filter((t) => t.status === "confirmed").length,
    received: transfers.filter((t) => t.status === "received").length,
  }), [transfers]);

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transfers.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.fromBranch.toLowerCase().includes(q) ||
        t.toBranch.toLowerCase().includes(q)
      );
    });
  }, [transfers, statusFilter, searchQuery]);

  return (
    <>
      <InventoryHeader
        title="Điều chuyển nội bộ"
        actions={
          <Button size="sm">
            <IconPlus className="size-4" />
            Tạo phiếu
          </Button>
        }
      />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-4">
          {/* Status filter buttons */}
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tất cả"],
                ["draft", "Nháp"],
                ["in_transit", "Đang vận chuyển"],
                ["confirmed", "Chờ nhận"],
                ["received", "Đã nhận"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                variant={statusFilter === key ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(key)}
              >
                {label}
                <Badge variant="secondary" className="ml-2">
                  {statusCounts[key]}
                </Badge>
              </Button>
            ))}
          </div>

          {/* IconSearch */}
          <InputGroup className="h-10">
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Tìm theo số phiếu, kho xuất/nhận..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </InputGroup>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số phiếu</TableHead>
                    <TableHead>Lộ trình</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày tạo</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.length === 0 && (
                    <TableEmptyStateRow
                      colSpan={5}
                      icon={<IconTruck className="size-5" />}
                      title="Không tìm thấy phiếu điều chuyển nào"
                    />
                  )}
                  {filteredTransfers.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/transfers/${t.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {t.code}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm">
                          <span>{t.fromBranch}</span>
                          <IconArrowRight className="size-3 text-muted-foreground" />
                          <span>{t.toBranch}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getInventoryStatusBadgeVariant(t.status)}>
                          {getInventoryStatusLabel(t.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.date}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link href={`/inventory/transfers/${t.id}`}>
                            <IconArrowRight className="size-4" />
                          </Link>
                        </Button>
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
