"use client";

import { useState, useTransition } from "react";
import { TriangleAlert as IconAlertTriangle, CircleCheck as IconCircleCheck } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
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
import { toast } from "@comtammatu/ui/components/sonner";
import { formatVND } from "@comtammatu/shared/format";
import {
  generateB01DN,
  generateB02DN,
  generateB03DN,
  generateForm01Gtgt,
  type CashflowConsistencyCheck,
  type Tt200ReportEnvelope,
  type Tt200ReportLine,
} from "../statement-actions";

import { FORM_VI } from "@comtammatu/shared/messages";
type B01Report = Tt200ReportEnvelope<{ as_of_date: string }>;
type B02Report = Tt200ReportEnvelope<{ start_date: string; end_date: string }>;
type B03Report = Tt200ReportEnvelope<{
  start_date: string;
  end_date: string;
  consistency_check: CashflowConsistencyCheck;
}>;
type GtgtReport = Tt200ReportEnvelope<{ period: string }>;

export function StatementsClient() {
  const [isPending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthOnly = today.slice(0, 7);

  const [b01Date, setB01Date] = useState(today);
  const [b01Data, setB01Data] = useState<B01Report | null>(null);

  const [b02Start, setB02Start] = useState(monthStart);
  const [b02End, setB02End] = useState(today);
  const [b02Data, setB02Data] = useState<B02Report | null>(null);

  const [b03Start, setB03Start] = useState(monthStart);
  const [b03End, setB03End] = useState(today);
  const [b03Data, setB03Data] = useState<B03Report | null>(null);

  const [vatPeriod, setVatPeriod] = useState(monthOnly);
  const [vatData, setVatData] = useState<GtgtReport | null>(null);

  function handleB01() {
    startTransition(async () => {
      const res = await generateB01DN({ asOfDate: b01Date });
      if (res.success) {
        setB01Data(res.data as B01Report);
      } else {
        toast.error(res.error ?? "Lỗi tạo báo cáo.");
      }
    });
  }

  function handleB02() {
    startTransition(async () => {
      const res = await generateB02DN({
        startDate: b02Start,
        endDate: b02End,
      });
      if (res.success) {
        setB02Data(res.data as B02Report);
      } else {
        toast.error(res.error ?? "Lỗi tạo báo cáo.");
      }
    });
  }

  function handleB03() {
    startTransition(async () => {
      const res = await generateB03DN({
        startDate: b03Start,
        endDate: b03End,
      });
      if (res.success) {
        setB03Data(res.data as B03Report);
      } else {
        toast.error(res.error ?? "Lỗi tạo báo cáo.");
      }
    });
  }

  function handleGtgt() {
    startTransition(async () => {
      const res = await generateForm01Gtgt({ period: vatPeriod });
      if (res.success) {
        setVatData(res.data as GtgtReport);
      } else {
        toast.error(res.error ?? "Lỗi tạo báo cáo.");
      }
    });
  }

  return (
    <Tabs defaultValue="b01" className="space-y-4">
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
        <TabsTrigger value="b01">B01-DN · CĐKT</TabsTrigger>
        <TabsTrigger value="b02">B02-DN · KQKD</TabsTrigger>
        <TabsTrigger value="b03">B03-DN · LCTT</TabsTrigger>
        <TabsTrigger value="gtgt">01/GTGT · Thuế GTGT</TabsTrigger>
      </TabsList>

      <TabsContent value="b01" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.toDate}
              </Label>
              <Input
                type="date"
                value={b01Date}
                onChange={(e) => setB01Date(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button onClick={handleB01} disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Tạo Bảng cân đối
            </Button>
          </CardContent>
        </Card>

        {b01Data ? (
          <Tt200Report
            title="B01-DN — Bảng Cân Đối Kế Toán"
            subtitle={`Đến ngày ${b01Data.meta.as_of_date}`}
            data={b01Data}
            assertion={(lines) => assertEquality(lines, "270", "440")}
          />
        ) : (
          <EmptyState />
        )}
      </TabsContent>

      <TabsContent value="b02" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.fromDate}
              </Label>
              <Input
                type="date"
                value={b02Start}
                onChange={(e) => setB02Start(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.toDate}
              </Label>
              <Input
                type="date"
                value={b02End}
                onChange={(e) => setB02End(e.target.value)}
              />
            </div>
            <Button onClick={handleB02} disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Tạo KQKD
            </Button>
          </CardContent>
        </Card>

        {b02Data ? (
          <Tt200Report
            title="B02-DN — Báo Cáo Kết Quả Kinh Doanh"
            subtitle={`${b02Data.meta.start_date} → ${b02Data.meta.end_date}`}
            data={b02Data}
          />
        ) : (
          <EmptyState />
        )}
      </TabsContent>

      <TabsContent value="b03" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.fromDate}
              </Label>
              <Input
                type="date"
                value={b03Start}
                onChange={(e) => setB03Start(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {FORM_VI.toDate}
              </Label>
              <Input
                type="date"
                value={b03End}
                onChange={(e) => setB03End(e.target.value)}
              />
            </div>
            <Button onClick={handleB03} disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Tạo LCTT
            </Button>
          </CardContent>
        </Card>

        {b03Data ? (
          <>
            <Tt200Report
              title="B03-DN — Báo Cáo Lưu Chuyển Tiền Tệ (gián tiếp)"
              subtitle={`${b03Data.meta.start_date} → ${b03Data.meta.end_date}`}
              data={b03Data}
            />
            <CashflowConsistencyBanner check={b03Data.meta.consistency_check} />
          </>
        ) : (
          <EmptyState />
        )}
      </TabsContent>

      <TabsContent value="gtgt" className="mt-0 space-y-4">
        <Card>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kỳ kê khai (YYYY-MM)
              </Label>
              <Input
                type="month"
                value={vatPeriod}
                onChange={(e) => setVatPeriod(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <Button onClick={handleGtgt} disabled={isPending}>
              {isPending ? <Spinner /> : null}
              Tạo Tờ khai
            </Button>
          </CardContent>
        </Card>

        {vatData ? (
          <Tt200Report
            title="01/GTGT — Tờ Khai Thuế Giá Trị Gia Tăng"
            subtitle={`Kỳ ${vatData.meta.period}`}
            data={vatData}
          />
        ) : (
          <EmptyState />
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState() {
  return (
    <Empty className="py-8">
      <EmptyHeader>
        <EmptyTitle className="text-sm font-semibold">Chưa có báo cáo</EmptyTitle>
        <EmptyDescription className="text-xs leading-5">
          Chọn kỳ và nhấn nút <strong>Tạo</strong> để xem báo cáo.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function CashflowConsistencyBanner({
  check,
}: {
  check: CashflowConsistencyCheck;
}) {
  const Icon = check.consistent ? IconCircleCheck : IconAlertTriangle;
  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant={check.consistent ? "secondary" : "destructive"}
            className="gap-1"
          >
            <Icon className="size-3" />
            {check.consistent
              ? "Đối chiếu cân khớp"
              : "Lệch sổ — kế toán phải kiểm tra"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          B03-DN audit invariant: tiền cuối kỳ − tiền đầu kỳ phải bằng lưu
          chuyển tiền thuần trong kỳ. Lệch &gt; 1 VND đồng nghĩa có bút toán
          tiền (111/112) chưa khớp với operating/investing/financing buckets
          — thường do định khoản sai cashflow_section trên tài khoản.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ConsistencyStat
          label="Tiền đầu kỳ (60)"
          value={check.opening_cash}
        />
        <ConsistencyStat
          label="Tiền cuối kỳ (70)"
          value={check.closing_cash}
        />
        <ConsistencyStat
          label="LCT thuần (50)"
          value={check.net_cashflow}
        />
        <ConsistencyStat
          label="Chênh lệch"
          value={check.difference}
          tone={check.consistent ? undefined : "destructive"}
        />
      </CardContent>
    </Card>
  );
}

function ConsistencyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "destructive";
}) {
  const valueClass =
    tone === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="space-y-0.5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`font-mono text-lg font-semibold ${valueClass}`}>
        {formatVND(value)}
      </p>
    </div>
  );
}

interface Tt200ReportProps<TMeta extends object> {
  title: string;
  subtitle: string;
  data: Tt200ReportEnvelope<TMeta>;
  assertion?: (lines: Tt200ReportLine[]) => string | null;
}

function Tt200Report<TMeta extends object>({
  title,
  subtitle,
  data,
  assertion,
}: Tt200ReportProps<TMeta>) {
  const isDraft = data.status !== "final";
  const violation = assertion?.(data.lines) ?? null;

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {isDraft ? (
            <Badge variant="destructive" className="gap-1">
              <IconAlertTriangle className="size-3" /> BẢN NHÁP — kế toán phải
              đối chiếu trước khi nộp
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <IconCircleCheck className="size-3" /> Kỳ đã khóa sổ
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {violation ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {violation}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-24 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mã số
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Chỉ tiêu
              </TableHead>
              <TableHead className="w-44 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Số tiền (VND)
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.map((line) => (
              <TableRow
                key={line.line_code}
                className={line.is_total ? "bg-muted/30 font-semibold" : ""}
              >
                <TableCell className="font-mono text-xs">
                  {line.line_code}
                </TableCell>
                <TableCell
                  style={{ paddingLeft: `${(line.level - 1) * 1.5}rem` }}
                >
                  {line.line_label}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatVND(Number(line.amount))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function assertEquality(
  lines: Tt200ReportLine[],
  codeA: string,
  codeB: string,
): string | null {
  const a = lines.find((l) => l.line_code === codeA);
  const b = lines.find((l) => l.line_code === codeB);
  if (!a || !b) return null;
  const diff = Math.abs(Number(a.amount) - Number(b.amount));
  if (diff > 1) {
    return `Cảnh báo: ${codeA} (${formatVND(Number(a.amount))}) ≠ ${codeB} (${formatVND(Number(b.amount))}); chênh lệch ${formatVND(diff)}. Kiểm tra bút toán trước khi nộp.`;
  }
  return null;
}
