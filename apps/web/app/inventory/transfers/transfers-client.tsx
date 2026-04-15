"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIconButton,
  SectionCard,
} from "@/components/foundation/ui-patterns";
import {
  CheckCircle,
  Clock,
  Eye,
  Filter,
  Lightbulb,
  PlusCircle,
  Printer,
  Search,
  Truck,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { cn, getSurfacePanelClassName } from "@comtammatu/ui";
import {
  FilterBar,
  PageHeader,
  SearchableSelect,
  StatusBadge,
} from "../_components/shared";
import { TableEmptyStateRow } from "../_components/table-empty-state-row";

export type TransferRow = {
  id: number;
  code: string;
  fromBranch: string;
  toBranch: string;
  status: string;
  date: string;
};

export function TransfersClient({ transfers }: { transfers: TransferRow[] }) {
  const panelClassName = getSurfacePanelClassName(
    "inventory",
    "ambient-shadow",
  );
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const inTransit = transfers.filter((t) => t.status === "in_transit").length;
  const awaiting = transfers.filter((t) => t.status === "confirmed").length;
  const receivedCount = transfers.filter((t) => t.status === "received").length;

  const branchOptions = useMemo(() => {
    return [...new Set(transfers.map((t) => t.toBranch).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "vi"),
    );
  }, [transfers]);

  const filteredTransfers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return transfers.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (branchFilter !== "all" && t.toBranch !== branchFilter) return false;
      if (!q) return true;
      return (
        t.code.toLowerCase().includes(q) ||
        t.fromBranch.toLowerCase().includes(q) ||
        t.toBranch.toLowerCase().includes(q)
      );
    });
  }, [transfers, statusFilter, branchFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Luân chuyển nội bộ"
        actions={
          <Button
            type="button"
            className="min-h-11 rounded-full px-6 font-bold shadow-xl shadow-primary/15 transition-shadow hover:shadow-lg"
          >
            <PlusCircle className="size-4" />
            Tạo phiếu mới
          </Button>
        }
      />

      {/* Bento Summary Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {[
          {
            icon: <Truck className="size-7" />,
            iconBg: "bg-info/12",
            iconColor: "text-info",
            label: "Đang vận chuyển",
            value: String(inTransit).padStart(2, "0"),
          },
          {
            icon: <Clock className="size-7" />,
            iconBg: "bg-warning/12",
            iconColor: "text-warning",
            label: "Chờ nhận",
            value: String(awaiting).padStart(2, "0"),
          },
          {
            icon: <CheckCircle className="size-7" />,
            iconBg: "bg-success/12",
            iconColor: "text-success",
            label: "Đã nhận",
            value: String(receivedCount).padStart(2, "0"),
          },
        ].map((card) => (
          <SectionCard
            key={card.label}
            className={cn(
              panelClassName,
              "flex items-center gap-5 rounded-2xl bg-card",
            )}
            density="comfortable"
          >
            <div
              className={cn(
                "flex size-14 items-center justify-center rounded-full",
                card.iconBg,
                card.iconColor,
              )}
            >
              {card.icon}
            </div>
            <div>
              <p className="whitespace-nowrap text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {card.label}
              </p>
              <p className="text-3xl font-black">{card.value}</p>
            </div>
          </SectionCard>
        ))}
      </div>

      <FilterBar
        className={cn(panelClassName, "items-center bg-muted px-4 py-4")}
        surface="inventory"
      >
        <div className="relative min-w-col-lg flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Tìm mã phiếu, kho gửi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full border-none bg-card pl-10 pr-4 text-sm shadow-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <SearchableSelect
            options={[
              { value: "all", label: "Trạng thái" },
              { value: "in_transit", label: "Đang vận chuyển" },
              { value: "confirmed", label: "Chờ nhận" },
              { value: "received", label: "Hoàn thành" },
            ]}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="Trạng thái"
            searchPlaceholder="Tìm trạng thái..."
            variant="pill"
            className="min-w-col-sm bg-card"
          />
          <SearchableSelect
            options={[
              { value: "all", label: "Chi nhánh đến" },
              ...branchOptions.map((branch) => ({
                value: branch,
                label: branch,
              })),
            ]}
            value={branchFilter}
            onValueChange={setBranchFilter}
            placeholder="Chi nhánh đến"
            searchPlaceholder="Tìm chi nhánh..."
            variant="pill"
            className="min-w-col-sm bg-card"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full bg-card text-muted-foreground"
          >
            <Filter className="size-4" />
            Lọc thêm
          </Button>
        </div>
      </FilterBar>

      {/* Data Table */}
      <SectionCard
        className={cn(panelClassName, "overflow-hidden rounded-3xl bg-card")}
        density="compact"
      >
        <div className="-m-4 md:-m-5">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                {[
                  "Mã phiếu",
                  "Kho gửi",
                  "Kho nhận",
                  "Trạng thái",
                  "Ngày tạo",
                  "Thao tác",
                ].map((h) => (
                  <TableHead
                    key={h}
                    className="px-6 py-4 whitespace-nowrap text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransfers.length === 0 && (
                <TableEmptyStateRow
                  colSpan={6}
                  title="Không có phiếu luân chuyển phù hợp"
                  description="Thử điều chỉnh trạng thái, chi nhánh đến hoặc từ khóa tìm kiếm."
                />
              )}
              {filteredTransfers.map((t) => (
                <TableRow
                  key={t.id}
                  className="group border-border/40 transition-colors"
                >
                  <TableCell className="px-6 py-5">
                    <Link
                      href={`/inventory/transfers/${t.id}`}
                      className="focus-ring-standard rounded-sm font-bold tracking-tight text-primary hover:underline"
                    >
                      {t.code}
                    </Link>
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium">
                    {t.fromBranch}
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm font-medium">
                    {t.toBranch}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="px-6 py-5 text-sm text-muted-foreground">
                    {t.date}
                  </TableCell>
                  <TableCell className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <ActionIconButton
                        icon={<Eye className="size-4" />}
                        label="Xem phiếu"
                        className="size-8 border-none bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                      />
                      <ActionIconButton
                        icon={<Printer className="size-4" />}
                        label="In phiếu"
                        className="size-8 border-none bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>

      {/* Operational insight */}
      <SectionCard
        className="rounded-2xl border-info/20 bg-info/8"
        density="compact"
      >
        <div className="flex items-start gap-3">
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-info" />
          <div>
            <p className="text-sm font-semibold">Gợi ý vận hành</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {transfers.length > 0
                ? inTransit > 0
                  ? `Có ${inTransit} phiếu đang vận chuyển và ${awaiting} phiếu chờ nhận. Ưu tiên xác nhận hàng đến để giảm ùn tắc luân chuyển.`
                  : `Đã ghi nhận ${receivedCount} phiếu luân chuyển hoàn tất. Dữ liệu đang bám theo chứng từ thực tế của kho.`
                : "Chưa có phiếu luân chuyển nào. Khi phát sinh chứng từ thực, hệ thống sẽ tự hiển thị trạng thái ưu tiên."}
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
