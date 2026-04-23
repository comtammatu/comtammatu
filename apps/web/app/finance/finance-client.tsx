"use client";

import Link from "next/link";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { Button } from "@comtammatu/ui/components/button";
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
      <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto p-2">
        <TabsTrigger value="revenue">Doanh thu</TabsTrigger>
        <TabsTrigger value="invoices">
          Hóa đơn điện tử ({invoices.length})
        </TabsTrigger>
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link href="/finance/reconciliation">
            <IconAlertTriangle className="mr-1 size-4 text-amber-500" />
            Đối soát
          </Link>
        </Button>
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
