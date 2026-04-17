"use client";

import { useState, useTransition } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@comtammatu/ui/components/table";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  generateBalanceSheet,
  generateIncomeStatement,
  generateVatSummary,
} from "../statement-actions";

const fmt = (n: number) =>
  n.toLocaleString("vi-VN", { maximumFractionDigits: 0 });

export function StatementsClient() {
  const [isPending, startTransition] = useTransition();

  // Balance sheet state
  const [bsDate, setBsDate] = useState(new Date().toISOString().slice(0, 10));
  const [bsData, setBsData] = useState<Record<string, unknown> | null>(null);

  // Income statement state
  const [isStart, setIsStart] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [isEnd, setIsEnd] = useState(new Date().toISOString().slice(0, 10));
  const [isData, setIsData] = useState<Record<string, unknown> | null>(null);

  // VAT summary state
  const [vatPeriod, setVatPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [vatData, setVatData] = useState<Record<string, unknown> | null>(null);

  function handleBalanceSheet() {
    startTransition(async () => {
      const result = await generateBalanceSheet({ asOfDate: bsDate });
      if (result.success) {
        setBsData(result.data as Record<string, unknown>);
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handleIncomeStatement() {
    startTransition(async () => {
      const result = await generateIncomeStatement({ startDate: isStart, endDate: isEnd });
      if (result.success) {
        setIsData(result.data as Record<string, unknown>);
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  function handleVatSummary() {
    startTransition(async () => {
      const result = await generateVatSummary({ period: vatPeriod });
      if (result.success) {
        setVatData(result.data as Record<string, unknown>);
      } else {
        toast.error(result.error ?? "Lỗi");
      }
    });
  }

  return (
    <Tabs defaultValue="balance-sheet">
      <TabsList>
        <TabsTrigger value="balance-sheet">Bảng CĐKT</TabsTrigger>
        <TabsTrigger value="income">Kết quả KD</TabsTrigger>
        <TabsTrigger value="vat">Tổng hợp VAT</TabsTrigger>
      </TabsList>

      {/* ─── Balance Sheet ─── */}
      <TabsContent value="balance-sheet" className="mt-4 space-y-4">
        <div className="flex items-end gap-3">
          <div>
            <Label>Đến ngày</Label>
            <Input
              type="date"
              value={bsDate}
              onChange={(e) => setBsDate(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleBalanceSheet} disabled={isPending}>
            {isPending && <Spinner className="mr-2" />}
            Tạo báo cáo
          </Button>
        </div>

        {bsData && <BalanceSheetView data={bsData} />}
      </TabsContent>

      {/* ─── Income Statement ─── */}
      <TabsContent value="income" className="mt-4 space-y-4">
        <div className="flex items-end gap-3">
          <div>
            <Label>Từ ngày</Label>
            <Input
              type="date"
              value={isStart}
              onChange={(e) => setIsStart(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label>Đến ngày</Label>
            <Input
              type="date"
              value={isEnd}
              onChange={(e) => setIsEnd(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleIncomeStatement} disabled={isPending}>
            {isPending && <Spinner className="mr-2" />}
            Tạo báo cáo
          </Button>
        </div>

        {isData && <IncomeStatementView data={isData} />}
      </TabsContent>

      {/* ─── VAT Summary ─── */}
      <TabsContent value="vat" className="mt-4 space-y-4">
        <div className="flex items-end gap-3">
          <div>
            <Label>Kỳ (YYYY-MM)</Label>
            <Input
              type="month"
              value={vatPeriod}
              onChange={(e) => setVatPeriod(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={handleVatSummary} disabled={isPending}>
            {isPending && <Spinner className="mr-2" />}
            Tạo báo cáo
          </Button>
        </div>

        {vatData && <VatSummaryView data={vatData} />}
      </TabsContent>
    </Tabs>
  );
}

/* ─── Sub-views ─── */

interface AccountLine {
  account_code: string;
  account_name: string;
  balance: number;
}

function BalanceSheetView({ data }: { data: Record<string, unknown> }) {
  const assets = (data.assets as AccountLine[]) ?? [];
  const liabilities = (data.liabilities as AccountLine[]) ?? [];
  const equity = (data.equity as AccountLine[]) ?? [];
  const retainedEarnings = (data.retainedEarnings as number) ?? 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Assets */}
      <div className="rounded-md border">
        <div className="border-b bg-muted/50 px-4 py-2 font-semibold">
          TÀI SẢN
        </div>
        <Table>
          <TableBody>
            {assets.map((a) => (
              <TableRow key={a.account_code}>
                <TableCell className="font-mono text-sm">
                  {a.account_code}
                </TableCell>
                <TableCell>{a.account_name}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(a.balance)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold">
              <TableCell colSpan={2}>Tổng tài sản</TableCell>
              <TableCell className="text-right font-mono">
                {fmt(data.totalAssets as number)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Liabilities + Equity */}
      <div className="rounded-md border">
        <div className="border-b bg-muted/50 px-4 py-2 font-semibold">
          NỢ PHẢI TRẢ & VỐN CHỦ SỞ HỮU
        </div>
        <Table>
          <TableBody>
            {liabilities.map((a) => (
              <TableRow key={a.account_code}>
                <TableCell className="font-mono text-sm">
                  {a.account_code}
                </TableCell>
                <TableCell>{a.account_name}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(a.balance)}
                </TableCell>
              </TableRow>
            ))}
            {equity.map((a) => (
              <TableRow key={a.account_code}>
                <TableCell className="font-mono text-sm">
                  {a.account_code}
                </TableCell>
                <TableCell>{a.account_name}</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(a.balance)}
                </TableCell>
              </TableRow>
            ))}
            {retainedEarnings !== 0 && (
              <TableRow>
                <TableCell className="font-mono text-sm">421</TableCell>
                <TableCell>LN chưa phân phối (kỳ này)</TableCell>
                <TableCell className="text-right font-mono">
                  {fmt(retainedEarnings)}
                </TableCell>
              </TableRow>
            )}
            <TableRow className="font-bold">
              <TableCell colSpan={2}>Tổng nguồn vốn</TableCell>
              <TableCell className="text-right font-mono">
                {fmt(data.totalEquity as number)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

interface IncomeItem {
  account_code: string;
  account_name: string;
  amount: number;
}

function IncomeStatementView({ data }: { data: Record<string, unknown> }) {
  const revenue = (data.revenue as IncomeItem[]) ?? [];
  const expenses = (data.expenses as IncomeItem[]) ?? [];
  const netProfit = (data.netProfit as number) ?? 0;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">Mã TK</TableHead>
            <TableHead>Khoản mục</TableHead>
            <TableHead className="w-40 text-right">Số tiền (VND)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="bg-muted/30">
            <TableCell colSpan={3} className="font-semibold">
              DOANH THU
            </TableCell>
          </TableRow>
          {revenue.map((r) => (
            <TableRow key={r.account_code}>
              <TableCell className="font-mono text-sm">
                {r.account_code}
              </TableCell>
              <TableCell>{r.account_name}</TableCell>
              <TableCell className="text-right font-mono">
                {fmt(r.amount)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="font-bold">
            <TableCell colSpan={2}>Tổng doanh thu</TableCell>
            <TableCell className="text-right font-mono">
              {fmt(data.totalRevenue as number)}
            </TableCell>
          </TableRow>

          <TableRow className="bg-muted/30">
            <TableCell colSpan={3} className="font-semibold">
              CHI PHÍ
            </TableCell>
          </TableRow>
          {expenses.map((e) => (
            <TableRow key={e.account_code}>
              <TableCell className="font-mono text-sm">
                {e.account_code}
              </TableCell>
              <TableCell>{e.account_name}</TableCell>
              <TableCell className="text-right font-mono">
                {fmt(e.amount)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow className="font-bold">
            <TableCell colSpan={2}>Tổng chi phí</TableCell>
            <TableCell className="text-right font-mono">
              {fmt(data.totalExpenses as number)}
            </TableCell>
          </TableRow>

          <TableRow className="bg-primary/5 text-lg font-bold">
            <TableCell colSpan={2}>LỢI NHUẬN THUẦN</TableCell>
            <TableCell
              className={`text-right font-mono ${netProfit >= 0 ? "text-success" : "text-destructive"}`}
            >
              {fmt(netProfit)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

function VatSummaryView({ data }: { data: Record<string, unknown> }) {
  const output = data.output as {
    invoiceCount: number;
    subtotal: number;
    vatAmount: number;
  };
  const input = data.input as {
    invoiceCount: number;
    subtotal: number;
    vatAmount: number;
  };
  const vatPayable = (data.vatPayable as number) ?? 0;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Khoản mục</TableHead>
            <TableHead className="text-right">Số HĐ</TableHead>
            <TableHead className="text-right">Doanh thu/Chi phí</TableHead>
            <TableHead className="text-right">Thuế GTGT</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">
              GTGT đầu ra (bán hàng)
            </TableCell>
            <TableCell className="text-right">{output.invoiceCount}</TableCell>
            <TableCell className="text-right font-mono">
              {fmt(output.subtotal)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {fmt(output.vatAmount)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">
              GTGT đầu vào (mua hàng)
            </TableCell>
            <TableCell className="text-right">{input.invoiceCount}</TableCell>
            <TableCell className="text-right font-mono">
              {fmt(input.subtotal)}
            </TableCell>
            <TableCell className="text-right font-mono">
              {fmt(input.vatAmount)}
            </TableCell>
          </TableRow>
          <TableRow className="bg-primary/5 text-lg font-bold">
            <TableCell colSpan={3}>THUẾ GTGT PHẢI NỘP</TableCell>
            <TableCell
              className={`text-right font-mono ${vatPayable >= 0 ? "text-destructive" : "text-success"}`}
            >
              {fmt(vatPayable)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Số liệu này phục vụ tham khảo. Việc kê khai chính thức thực hiện qua
        eTax hoặc phần mềm kế toán.
      </p>
    </div>
  );
}
