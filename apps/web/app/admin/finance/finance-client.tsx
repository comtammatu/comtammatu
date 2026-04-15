"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import type { DailyRevenueRow, InvoiceRow, TopItemRow } from "./page";
import { InvoiceList } from "./invoice-list";
import { RevenueOverview } from "./revenue-overview";

interface FinanceClientProps {
  dailyRevenue: DailyRevenueRow[];
  topItems: TopItemRow[];
  invoices: InvoiceRow[];
}

export function FinanceClient({
  dailyRevenue,
  topItems,
  invoices,
}: FinanceClientProps) {
  return (
    <Tabs defaultValue="revenue" className="space-y-4">
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-lg border border-border/70 bg-muted/40 p-2">
        <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
        <TabsTrigger value="invoices">
          Hóa đơn điện tử ({invoices.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="revenue" className="mt-0">
        <RevenueOverview dailyRevenue={dailyRevenue} topItems={topItems} />
      </TabsContent>

      <TabsContent value="invoices" className="mt-0">
        <InvoiceList initialInvoices={invoices} />
      </TabsContent>
    </Tabs>
  );
}
