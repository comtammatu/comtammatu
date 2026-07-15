import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import { AppPage, AppPageHeader } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import {
  fetchSepayBankTransactions,
  fetchSepayPaymentWebhookSummary,
} from "../_lib/sepay-bank-transactions";
import { FilterBar } from "../components/filter-bar";
import {
  type FinanceParams,
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { fetchExpenseMatchOptions } from "../expense-actions";
import { BankTransactionsTable } from "./bank-transactions-table";

const copy = messages.finance.bankTransactions;

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params: FinanceParams = {
    ...parseFinanceParams(sp),
    branch: null,
    gran: "day",
    compare: "prev_month",
    payment: "all",
    cashier: null,
  };
  const resolved = resolveFinanceRange(params);
  const range = { start: resolved.start, end: resolved.end };
  const [authState, transactions, expenseOptionsRes, paymentWebhookSummary] =
    await Promise.all([
      loadAuthState(),
      fetchSepayBankTransactions(range),
      fetchExpenseMatchOptions(),
      fetchSepayPaymentWebhookSummary(range),
    ]);

  if (!expenseOptionsRes.success || !expenseOptionsRes.data) {
    throw new Error("Unable to load expense match options");
  }
  const expenseOptions = expenseOptionsRes.data;
  const canLinkPayments = authState.claims.user_role === "owner";

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
        meta={messages.finance.basic.periodMeta(resolved.start, resolved.end)}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/finance">{messages.finance.common.backToFinance}</Link>
          </Button>
        }
      />
      <FilterBar
        params={params}
        branches={[]}
        basePath="/finance/bank-transactions"
        hide={["branch", "granularity", "compare", "payment"]}
        compact
      />
      <BankTransactionsTable
        transactions={transactions}
        missingBankWebhookPayments={
          paymentWebhookSummary.missingBankWebhookPayments
        }
        expenseOptions={expenseOptions}
        canLinkPayments={canLinkPayments}
      />
    </AppPage>
  );
}
