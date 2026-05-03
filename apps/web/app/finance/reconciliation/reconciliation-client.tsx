"use client";

import { useState, useTransition } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
} from "lucide-react";
import { BRANCH_VI, FORM_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Spinner } from "@comtammatu/ui/components/spinner";
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
import { formatVND } from "@comtammatu/shared/format";
import { fetchReconciliationByDay } from "../actions";
import {
  fetchReconciliation,
  fetchReconciliationDrilldown,
  type ReconciliationCategory,
  type ReconciliationCategoryRow,
  type ReconciliationDrilldownRow,
  type ReconciliationReport,
} from "../reconciliation-actions";

interface ReconcileByDayRow {
  date: string;
  revenue_paid: number;
  gl_credit: number;
  diff: number;
}

const TOLERANCE_VND = 1;

type DesyncRow = {
  payment_id: number;
  order_id: number;
  branch_id: number | null;
  amount: number;
  payment_method: string | null;
  payment_paid_at: string | null;
  order_payment_status: string | null;
  age_minutes: number | null;
};

interface BranchOption {
  id: number;
  name: string;
}

export interface ReconciliationClientProps {
  branches: BranchOption[];
  desync: DesyncRow[];
  defaultStartDate: string;
  defaultEndDate: string;
}

interface DrilldownState {
  open: boolean;
  category: ReconciliationCategory | null;
  side: "subledger" | "gl";
  rows: ReconciliationDrilldownRow[];
  loading: boolean;
  error: string | null;
}

const initialDrilldown: DrilldownState = {
  open: false,
  category: null,
  side: "subledger",
  rows: [],
  loading: false,
  error: null,
};

export function ReconciliationClient({
  branches,
  desync,
  defaultStartDate,
  defaultEndDate,
}: ReconciliationClientProps) {
  const [branchId, setBranchId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [report, setReport] = useState<ReconciliationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startTransition] = useTransition();
  const [drilldown, setDrilldown] = useState<DrilldownState>(initialDrilldown);
  const [byDayRows, setByDayRows] = useState<ReconcileByDayRow[]>([]);
  const [byDayLoading, setByDayLoading] = useState(false);
  const [byDayError, setByDayError] = useState<string | null>(null);

  const branchName = (id: number | null) =>
    id == null ? "—" : (branches.find((b) => b.id === id)?.name ?? `#${id}`);

  function handleRun() {
    setError(null);
    startTransition(async () => {
      const res = await fetchReconciliation({
        branchId,
        startDate,
        endDate,
      });
      if (!res.success) {
        setError(res.error ?? "Không thể tải dữ liệu.");
        setReport(null);
        return;
      }
      setReport(res.data as ReconciliationReport);
    });
  }

  async function loadByDay() {
    setByDayLoading(true);
    setByDayError(null);
    const res = await fetchReconciliationByDay(branchId, startDate, endDate);
    setByDayLoading(false);
    if (!res.success) {
      setByDayError(res.error ?? "Không thể tải đối chiếu theo ngày.");
      setByDayRows([]);
      return;
    }
    setByDayRows((res.data as ReconcileByDayRow[]) ?? []);
  }

  async function openDrilldown(
    category: ReconciliationCategory,
    side: "subledger" | "gl",
  ) {
    setDrilldown({
      open: true,
      category,
      side,
      rows: [],
      loading: true,
      error: null,
    });

    const res = await fetchReconciliationDrilldown({
      branchId,
      startDate,
      endDate,
      category,
      side,
    });

    setDrilldown((prev) => ({
      ...prev,
      loading: false,
      rows: res.success ? (res.data as ReconciliationDrilldownRow[]) : [],
      error: res.success ? null : (res.error ?? "Không thể tải chi tiết."),
    }));
  }

  const summary = report
    ? summarize(report.categories)
    : { totalDiff: 0, exceptions: 0 };

  return (
    <Tabs defaultValue="period" className="space-y-4">
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
        <TabsTrigger value="period">Đối chiếu kỳ</TabsTrigger>
        <TabsTrigger value="by-day">DT theo ngày</TabsTrigger>
        <TabsTrigger value="desync">
          Lệch payment ↔ đơn ({desync.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="period" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {BRANCH_VI.long}
              </label>
              <Select
                value={branchId == null ? "all" : String(branchId)}
                onValueChange={(v) =>
                  setBranchId(v === "all" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={BRANCH_VI.selectAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.fromDate}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.toDate}
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button
              onClick={handleRun}
              disabled={isLoading}
              className="self-end"
            >
              {isLoading ? <Spinner /> : null}
              Đối chiếu
            </Button>
          </CardContent>
        </Card>

        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {report ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                title="Khoảng đối chiếu"
                value={`${report.start_date} → ${report.end_date}`}
                hint={branchName(report.branch_id)}
              />
              <SummaryCard
                title="Tổng chênh lệch"
                value={formatVND(summary.totalDiff)}
                hint={`Dung sai: ${formatVND(TOLERANCE_VND)}`}
                highlight={Math.abs(summary.totalDiff) > TOLERANCE_VND}
              />
              <SummaryCard
                title="Số mục lệch"
                value={`${summary.exceptions} / ${report.categories.length}`}
                hint={
                  summary.exceptions === 0 ? "Khớp toàn bộ" : "Cần kiểm tra"
                }
                highlight={summary.exceptions > 0}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Chi tiết theo nhóm hạch toán
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Nhóm
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Sổ phụ
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Sổ cái
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Chênh lệch
                      </TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {FORM_VI.status}
                      </TableHead>
                      <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        Drilldown
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.categories.map((cat) => (
                      <CategoryRow
                        key={cat.category}
                        cat={cat}
                        branchActive={report.branch_id != null}
                        onDrill={openDrilldown}
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Empty className="py-8">
            <EmptyHeader>
              <EmptyTitle className="text-sm font-semibold">
                Chưa có kết quả
              </EmptyTitle>
              <EmptyDescription className="text-xs leading-5">
                Chọn khoảng ngày và nhấn <strong>Đối chiếu</strong> để tải kết
                quả.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>

      <TabsContent value="by-day" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {BRANCH_VI.acronym}
              </label>
              <Select
                value={branchId == null ? "all" : String(branchId)}
                onValueChange={(value) =>
                  setBranchId(value === "all" ? null : Number(value))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả chi nhánh</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.fromDate}
              </label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.toDate}
              </label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={loadByDay} disabled={byDayLoading}>
              {byDayLoading ? "Đang tải..." : "Đối chiếu theo ngày"}
            </Button>
          </CardContent>
        </Card>

        <ByDayTable
          rows={byDayRows}
          loading={byDayLoading}
          error={byDayError}
        />
      </TabsContent>

      <TabsContent value="desync" className="mt-0">
        <DesyncTable rows={desync} branchName={branchName} />
      </TabsContent>

      <Sheet
        open={drilldown.open}
        onOpenChange={(open) => setDrilldown((prev) => ({ ...prev, open }))}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              Chi tiết{" "}
              {drilldown.category ? labelForCategory(drilldown.category) : ""}
            </SheetTitle>
            <SheetDescription>
              {drilldown.side === "subledger"
                ? "Sổ phụ — chứng từ gốc"
                : "Sổ cái — bút toán đã ghi nhận"}{" "}
              · tối đa 200 dòng gần nhất
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            {drilldown.loading ? (
              <div className="flex justify-center py-10 text-muted-foreground">
                <Spinner className="size-5" />
              </div>
            ) : drilldown.error ? (
              <p className="py-10 text-center text-sm text-destructive">
                {drilldown.error}
              </p>
            ) : drilldown.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Không có dữ liệu trong khoảng đã chọn.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Tham chiếu
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {FORM_VI.date}
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {BRANCH_VI.long}
                    </TableHead>
                    <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Số tiền
                    </TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      Mô tả
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drilldown.rows.map((row) => (
                    <TableRow key={`${row.ref_id}-${row.ref_date}`}>
                      <TableCell className="font-mono text-xs">
                        {row.ref_label}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(row.ref_date).toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className="text-sm">
                        {branchName(row.branch_id)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatVND(Number(row.amount))}
                      </TableCell>
                      <TableCell className="max-w-sm text-xs text-muted-foreground">
                        <span className="line-clamp-2 break-words">
                          {row.description ?? "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Tabs>
  );
}

function summarize(rows: ReconciliationCategoryRow[]) {
  let totalDiff = 0;
  let exceptions = 0;
  for (const row of rows) {
    if (row.difference == null) continue;
    const d = Number(row.difference);
    totalDiff += Math.abs(d);
    if (Math.abs(d) > TOLERANCE_VND) exceptions += 1;
  }
  return { totalDiff, exceptions };
}

function labelForCategory(c: ReconciliationCategory): string {
  switch (c) {
    case "sales":
      return "Doanh thu + VAT (511+33311)";
    case "cogs":
      return "Giá vốn (621)";
    case "inventory_in":
      return "Nhập kho NVL (152)";
    case "payroll":
      return "Lương nhân công (622)";
    case "ap_payment":
      return "Thanh toán NCC (331)";
  }
}

function SummaryCard({
  title,
  value,
  hint,
  highlight,
}: {
  title: string;
  value: string;
  hint?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <p
          className={`text-xl font-semibold ${
            highlight ? "text-warning-foreground" : ""
          }`}
        >
          {value}
        </p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function CategoryRow({
  cat,
  branchActive,
  onDrill,
}: {
  cat: ReconciliationCategoryRow;
  branchActive: boolean;
  onDrill: (category: ReconciliationCategory, side: "subledger" | "gl") => void;
}) {
  const tenantWideOnly = !cat.branch_scoped && branchActive;
  const diff = cat.difference == null ? null : Number(cat.difference);
  const isException = diff != null && Math.abs(diff) > TOLERANCE_VND;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>{cat.label}</div>
        <div className="text-xs text-muted-foreground">{cat.category}</div>
      </TableCell>
      <TableCell className="text-right">
        {cat.subledger_total == null
          ? "—"
          : formatVND(Number(cat.subledger_total))}
      </TableCell>
      <TableCell className="text-right">
        {cat.gl_total == null ? "—" : formatVND(Number(cat.gl_total))}
      </TableCell>
      <TableCell
        className={`text-right ${
          isException ? "font-semibold text-warning-foreground" : ""
        }`}
      >
        {diff == null ? "—" : formatVND(diff)}
      </TableCell>
      <TableCell>
        {tenantWideOnly ? (
          <Badge variant="outline" className="text-xs">
            Toàn doanh nghiệp
          </Badge>
        ) : isException ? (
          <Badge variant="destructive" className="gap-1 text-xs">
            <IconAlertTriangle className="size-3" /> Lệch
          </Badge>
        ) : diff == null ? (
          <Badge variant="outline" className="text-xs">
            Không áp dụng
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-xs">
            <IconCircleCheck className="size-3" /> Khớp
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={tenantWideOnly}
            onClick={() => onDrill(cat.category, "subledger")}
          >
            Sổ phụ <IconChevronRight className="ml-1 size-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={tenantWideOnly}
            onClick={() => onDrill(cat.category, "gl")}
          >
            Sổ cái <IconChevronRight className="ml-1 size-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function ByDayTable({
  rows,
  loading,
  error,
}: {
  rows: ReconcileByDayRow[];
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-10">
          <Spinner />
        </CardContent>
      </Card>
    );
  }
  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Chọn khoảng ngày và bấm &quot;Đối chiếu theo ngày&quot; để xem chênh
          lệch DT POS ↔ Sổ cái cho từng ngày.
        </CardContent>
      </Card>
    );
  }

  const totalRevenue = rows.reduce((s, r) => s + r.revenue_paid, 0);
  const totalGl = rows.reduce((s, r) => s + r.gl_credit, 0);
  const totalDiff = totalRevenue - totalGl;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Đối chiếu DT POS ↔ Sổ cái — theo ngày
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Cột POS bucket theo `paid_at`, cột Sổ cái bucket theo `entry_date`,
          cùng giờ Việt Nam. Ngày khớp đến ±1 ₫ được đánh dấu &quot;Khớp&quot;.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ngày</TableHead>
              <TableHead className="text-right">POS (sổ phụ)</TableHead>
              <TableHead className="text-right">Sổ cái 511+33311</TableHead>
              <TableHead className="text-right">Chênh lệch</TableHead>
              <TableHead className="w-32">Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const matched = Math.abs(r.diff) <= TOLERANCE_VND;
              return (
                <TableRow key={r.date}>
                  <TableCell className="tabular-nums font-medium">
                    {r.date}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(r.revenue_paid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatVND(r.gl_credit)}
                  </TableCell>
                  <TableCell
                    className={
                      matched
                        ? "text-right tabular-nums text-success"
                        : "text-right tabular-nums font-medium text-destructive"
                    }
                  >
                    {matched ? "0" : formatVND(r.diff)}
                  </TableCell>
                  <TableCell>
                    {matched ? (
                      <Badge variant="success" className="gap-1">
                        <IconCircleCheck className="size-3.5" />
                        Khớp
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <IconAlertTriangle className="size-3.5" />
                        Lệch
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40">
              <TableCell className="font-medium">Tổng</TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatVND(totalRevenue)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatVND(totalGl)}
              </TableCell>
              <TableCell
                className={
                  Math.abs(totalDiff) <= TOLERANCE_VND
                    ? "text-right tabular-nums font-bold text-success"
                    : "text-right tabular-nums font-bold text-destructive"
                }
              >
                {Math.abs(totalDiff) <= TOLERANCE_VND
                  ? "Khớp"
                  : formatVND(totalDiff)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DesyncTable({
  rows,
  branchName,
}: {
  rows: DesyncRow[];
  branchName: (id: number | null) => string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <IconCircleCheck className="size-4 text-success" />
          Tất cả thanh toán đều khớp trạng thái đơn trong cửa sổ 30 ngày gần
          nhất.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <IconAlertTriangle className="size-4 text-warning-foreground" />
          {rows.length} mục cần kiểm tra
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Payment
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Đơn
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {BRANCH_VI.long}
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Số tiền
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Phương thức
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Order status
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Paid lúc
              </TableHead>
              <TableHead className="text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Lệch
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.payment_id}>
                <TableCell className="font-mono text-xs">
                  #{r.payment_id}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  #{r.order_id}
                </TableCell>
                <TableCell className="text-sm">
                  {branchName(r.branch_id)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatVND(Number(r.amount))}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    {r.payment_method ?? "—"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={
                      r.order_payment_status === "refunded"
                        ? "destructive"
                        : "outline"
                    }
                  >
                    {r.order_payment_status ?? "unpaid"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  {r.payment_paid_at
                    ? new Date(r.payment_paid_at).toLocaleString("vi-VN")
                    : "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {r.age_minutes != null ? `${r.age_minutes} phút` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
