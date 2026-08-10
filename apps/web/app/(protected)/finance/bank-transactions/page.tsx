import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppPage, AppPageHeader } from "@/components/surface";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import {
  fetchSepayBankTransactions,
  fetchSepayPaymentWebhookSummary,
  SEPAY_LIST_PAGE_SIZE,
} from "../_lib/sepay-bank-transactions";
import { loadExpenseMatchOptions } from "../_lib/expense-match-options";
import {
  type FinanceParams,
  parseFinanceParams,
  resolveFinanceRange,
} from "../_lib/finance-params";
import { BankTransactionsTable } from "./bank-transactions-table";
import { SepayImportDialog } from "./sepay-import-dialog";

const copy = messages.finance.bankTransactions;

export default async function BankTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params: FinanceParams = {
    ...parseFinanceParams(sp),
    location: "all",
    branch: null,
    gran: "day",
    compare: "prev_month",
    payment: "all",
    cashier: null,
  };
  const resolved = resolveFinanceRange(params);
  const range = { start: resolved.start, end: resolved.end };
  const [canLinkPayments, transactions, paymentWebhookSummary] =
    await Promise.all([
      currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW),
      fetchSepayBankTransactions(range, { maxRows: SEPAY_LIST_PAGE_SIZE }),
      fetchSepayPaymentWebhookSummary(range),
    ]);
  const expenseOptions = await loadExpenseMatchOptions(
    transactions.flatMap((transaction) => transaction.expenseIds),
  );
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={copy.title}
        description={copy.description}
        actions={canLinkPayments ? <SepayImportDialog /> : undefined}
      />
      <BankTransactionsTable
        params={params}
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
