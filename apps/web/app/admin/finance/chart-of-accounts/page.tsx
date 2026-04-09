import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { ChartOfAccountsClient } from "./coa-client";

export default async function ChartOfAccountsPage() {
  const result = await fetchChartOfAccounts();
  const accounts = result.success ? ((result.data ?? []) as AccountRow[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Hệ thống tài khoản
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hệ thống tài khoản kế toán theo chuẩn VAS
        </p>
      </div>

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
