import Link from "next/link";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { KpiCard } from "@/components/kpi/kpi-card";
import {
  AppPage,
  AppPageHeader,
  AppSection,
  KpiRow,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";
import { buildSepayReconciliationSummary } from "../_lib/sepay-bank-transaction-model";
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

  const expenseOptions =
    expenseOptionsRes.success && expenseOptionsRes.data
      ? expenseOptionsRes.data
      : [];
  const summary = buildSepayReconciliationSummary(transactions);
  const needsReviewCount =
    summary.needsReviewCount +
    paymentWebhookSummary.openMissingBankWebhookCount;
  const needsReviewAmount =
    summary.needsReviewAmount +
    paymentWebhookSummary.openMissingBankWebhookAmount;
  const canLinkPayments = authState.claims.user_role === "owner";

  return (
    <AppPage width="wide" density="compact">
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

      <KpiRow density="compact">
        <KpiCard
          label={copy.reconciliation.matched}
          value={String(summary.matchedCount)}
          hint={copy.reconciliation.matchedHint}
          tone={needsReviewCount === 0 ? "success" : "neutral"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.needsReview}
          value={String(needsReviewCount)}
          hint={copy.reconciliation.needsReviewHint(
            formatVND(needsReviewAmount),
            String(summary.needsReviewCount),
            String(paymentWebhookSummary.openMissingBankWebhookCount),
          )}
          tone={needsReviewCount > 0 ? "warning" : "success"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.unmatchedMoneyIn}
          value={formatVND(summary.unmatchedMoneyInAmount)}
          hint={copy.reconciliation.unmatchedMoneyInHint(
            String(summary.unmatchedMoneyInCount),
          )}
          tone={summary.unmatchedMoneyInCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.missingBankWebhook}
          value={formatVND(paymentWebhookSummary.missingBankWebhookAmount)}
          hint={copy.reconciliation.missingBankWebhookHint(
            String(paymentWebhookSummary.missingBankWebhookCount),
            String(paymentWebhookSummary.checkedPaymentCount),
            String(paymentWebhookSummary.openMissingBankWebhookCount),
          )}
          tone={
            paymentWebhookSummary.missingBankWebhookCount > 0
              ? "warning"
              : "success"
          }
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.unmatchedMoneyOut}
          value={formatVND(summary.unmatchedMoneyOutAmount)}
          hint={copy.reconciliation.unmatchedMoneyOutHint(
            String(summary.unmatchedMoneyOutCount),
          )}
          tone={summary.unmatchedMoneyOutCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </KpiRow>

      <AppSection size="sm" title={copy.listTitle}>
        <BankTransactionsTable
          transactions={transactions}
          missingBankWebhookPayments={
            paymentWebhookSummary.missingBankWebhookPayments
          }
          expenseOptions={expenseOptions}
          canLinkPayments={canLinkPayments}
        />
      </AppSection>
    </AppPage>
  );
}
