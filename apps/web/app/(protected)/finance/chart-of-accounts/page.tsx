import { AppPage, AppPageHeader } from "@/components/surface";
import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { ChartOfAccountsClient } from "./coa-client";

export default async function ChartOfAccountsPage() {
  const result = await fetchChartOfAccounts();
  const accounts = result.success ? ((result.data ?? []) as AccountRow[]) : [];

  return (
    <AppPage>
      <AppPageHeader eyebrow="Tài chính" title="Hệ thống tài khoản" />
      <ChartOfAccountsClient initialAccounts={accounts} />
    </AppPage>
  );
}

export interface AccountRow {
  id: number;
  tenant_id: number;
  account_code: string;
  account_name: string;
  account_type: string;
  cashflow_section: string;
  parent_id: number | null;
  level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
