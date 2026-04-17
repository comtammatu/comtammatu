import { Card, CardContent } from "@comtammatu/ui/components/card";
import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { ChartOfAccountsClient } from "./coa-client";

export default async function ChartOfAccountsPage() {
  const result = await fetchChartOfAccounts();
  const accounts = result.success ? ((result.data ?? []) as AccountRow[]) : [];

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Hệ thống tài khoản
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <ChartOfAccountsClient initialAccounts={accounts} />
    </div>
  );
}

export interface AccountRow {
  id: number;
  tenant_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  parent_id: number | null;
  level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
