import { fetchPostingRules } from "../posting-rules-actions";
import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
import { PageContainer, PageHeader } from "@/components/patterns";
import { PostingRulesClient } from "./posting-rules-client";

export default async function PostingRulesPage() {
  const [rulesRes, accountsRes] = await Promise.all([
    fetchPostingRules(),
    fetchChartOfAccounts(),
  ]);

  const rules = rulesRes.success
    ? ((rulesRes.data ?? []) as PostingRuleRow[])
    : [];
  const accounts = accountsRes.success
    ? ((accountsRes.data ?? []) as AccountOption[])
    : [];

  return (
    <PageContainer>
      <PageHeader eyebrow="Tài chính" title="Quy tắc hạch toán tự động" />
      <PostingRulesClient rules={rules} accounts={accounts} />
    </PageContainer>
  );
}

export interface PostingRuleRow {
  id: number;
  rule_code: string;
  description: string;
  transaction_type: string;
  debit_account_code: string;
  credit_account_code: string;
  is_active: boolean;
}

export interface AccountOption {
  id: number;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
}
