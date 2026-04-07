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
    <Tabs defaultValue="revenue">
      <TabsList>
        <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
        <TabsTrigger value="invoices">
          Hóa đơn điện tử ({invoices.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="revenue" className="mt-4">
        <RevenueOverview dailyRevenue={dailyRevenue} topItems={topItems} />
      </TabsContent>

      <TabsContent value="invoices" className="mt-4">
        <InvoiceList initialInvoices={invoices} />
      </TabsContent>
    </Tabs>
  );
}
