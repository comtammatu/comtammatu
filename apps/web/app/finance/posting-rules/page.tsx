import { Card, CardContent } from "@comtammatu/ui/components/card";
import { fetchPostingRules } from "../posting-rules-actions";
import { fetchChartOfAccounts } from "../chart-of-accounts-actions";
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
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              Tài chính
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Quy tắc hạch toán tự động
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <PostingRulesClient rules={rules} accounts={accounts} />
    </div>
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
