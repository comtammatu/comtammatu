import { AlertTriangle as IconAlert } from "lucide-react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import { messages } from "@lib/messages";
import {
  canIssueManualInvoice,
  fetchAccessibleBranches,
  fetchTaxInvoicesPage,
} from "../actions";
import type { TaxInvoiceCursor } from "../actions";
import type { InvoiceRow } from "../_lib/finance-types";
import { parseFinanceParams } from "../_lib/finance-params";
import { InvoiceList } from "../invoice-list";

const copy = messages.finance.invoicesPage;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = parseFinanceParams(sp);
  const branchId = params.branch ?? undefined;
  // `?queue=attention` deep-link from /finance narrows the list to invoices
  // still needing action (drafts + in-flight issuance) so the bulk re-issue
  // button surfaces on page 1 instead of behind many "Tải thêm" clicks.
  const queueValue = sp.queue;
  const queue =
    (Array.isArray(queueValue) ? queueValue[0] : queueValue) === "attention"
      ? ("attention" as const)
      : undefined;

  const [res, canManageInvoices, canIssueInvoices, branchesRes] =
    await Promise.all([
      fetchTaxInvoicesPage({ branchId, queue }),
      currentUserHasAnyPermissionAny([
        PERMISSION_KEYS.SETTINGS_TENANT,
        PERMISSION_KEYS.ORDERS_REFUND_APPROVE,
      ]),
      // Same predicate createTaxInvoice enforces — gates the "issue for a past
      // order" button so button-visible ⊆ action-authorized (no click-then-403).
      canIssueManualInvoice(),
      fetchAccessibleBranches(),
    ]);
  const branches = (
    branchesRes.success ? (branchesRes.data ?? []) : []
  ) as { id: number; name: string }[];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      {res.success ? (
        <InvoiceList
          initialInvoices={(res.data?.items ?? []) as InvoiceRow[]}
          initialHasMore={res.data?.hasMore ?? false}
          initialNextCursor={
            (res.data?.nextCursor ?? null) as TaxInvoiceCursor | null
          }
          branchId={branchId}
          queue={queue}
          canManageInvoices={canManageInvoices}
          canIssueInvoices={canIssueInvoices}
          branches={branches}
        />
      ) : (
        <AppEmptyState
          mode="error"
          icon={<IconAlert />}
          title={copy.loadError}
          description={res.error ?? undefined}
        />
      )}
    </AppPage>
  );
}
