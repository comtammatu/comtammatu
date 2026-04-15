import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { PageContainer, PageHeader } from "@/components/v2/patterns";
import { ChartOfAccountsClient } from "./coa-client";

export default async function ChartOfAccountsPage() {
  const result = await fetchChartOfAccounts();
  const accounts = result.success ? ((result.data ?? []) as AccountRow[]) : [];

  return (
    <PageContainer>
      <PageHeader eyebrow="Tài chính" title="Hệ thống tài khoản" />
      <ChartOfAccountsClient initialAccounts={accounts} />
    </PageContainer>
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
