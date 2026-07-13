import Link from "next/link";
import { formatCount, formatVND } from "@comtammatu/shared/format";
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
import { fetchMomoPaymentExceptions } from "../_lib/momo-payment-exceptions";
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
import { MomoPaymentExceptionsTable } from "./momo-payment-exceptions-table";

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
    cashier: null,
  };
  const resolved = resolveFinanceRange(params);
  const range = { start: resolved.start, end: resolved.end };
  const [
    authState,
    transactions,
    expenseOptionsRes,
    paymentWebhookSummary,
    momoExceptions,
  ] = await Promise.all([
    loadAuthState(),
    fetchSepayBankTransactions(range),
    fetchExpenseMatchOptions(),
    fetchSepayPaymentWebhookSummary(range),
    fetchMomoPaymentExceptions(),
  ]);

  if (!expenseOptionsRes.success || !expenseOptionsRes.data) {
    throw new Error("Unable to load expense allocation options");
  }
  const expenseOptions = expenseOptionsRes.data;
  const summary = buildSepayReconciliationSummary(transactions);
  const activeMomoExceptions = momoExceptions.items.filter(
    (item) => item.reviewStatus !== "refunded",
  );
  const activeMomoAmount = activeMomoExceptions.reduce(
    (sum, item) => sum + item.amount,
    0,
  );
  const needsReviewCount =
    summary.needsReviewCount +
    paymentWebhookSummary.openMissingBankWebhookCount +
    activeMomoExceptions.length;
  const bankNeedsReviewAmount =
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
        hide={["branch", "granularity", "compare"]}
        compact
      />

      <KpiRow density="compact">
        <KpiCard
          label={copy.reconciliation.matched}
          value={formatCount(summary.matchedCount)}
          hint={copy.reconciliation.matchedHint}
          tone={needsReviewCount === 0 ? "success" : "neutral"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.needsReview}
          value={formatCount(needsReviewCount)}
          hint={copy.reconciliation.needsReviewHint(
            formatVND(bankNeedsReviewAmount),
            formatVND(activeMomoAmount),
            formatCount(summary.needsReviewCount),
            formatCount(paymentWebhookSummary.openMissingBankWebhookCount),
            formatCount(activeMomoExceptions.length),
          )}
          tone={needsReviewCount > 0 ? "warning" : "success"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.unmatchedMoneyIn}
          value={formatVND(summary.unmatchedMoneyInAmount)}
          hint={copy.reconciliation.unmatchedMoneyInHint(
            formatCount(summary.unmatchedMoneyInCount),
          )}
          tone={summary.unmatchedMoneyInCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
        <KpiCard
          label={copy.reconciliation.missingBankWebhook}
          value={formatVND(paymentWebhookSummary.missingBankWebhookAmount)}
          hint={copy.reconciliation.missingBankWebhookHint(
            formatCount(paymentWebhookSummary.missingBankWebhookCount),
            formatCount(paymentWebhookSummary.checkedPaymentCount),
            formatCount(paymentWebhookSummary.openMissingBankWebhookCount),
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
            formatCount(summary.unmatchedMoneyOutCount),
          )}
          tone={summary.unmatchedMoneyOutCount > 0 ? "warning" : "neutral"}
          density="compact"
        />
      </KpiRow>

      <AppSection
        size="sm"
        title={copy.momoExceptions.title}
        description={copy.momoExceptions.description}
      >
        <MomoPaymentExceptionsTable
          exceptions={momoExceptions.items}
          canReview={canLinkPayments}
          loadFailed={momoExceptions.failed}
        />
      </AppSection>

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
