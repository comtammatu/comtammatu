import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchTaxInvoicesPage } from "../actions";
import type { TaxInvoiceCursor } from "../actions";
import type { InvoiceRow } from "../_lib/finance-types";
import { InvoiceList } from "../invoice-list";

const copy = messages.finance.invoicesPage;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { branch } = await searchParams;
  const parsedBranch = branch && branch !== "all" ? Number(branch) : NaN;
  const branchId =
    Number.isFinite(parsedBranch) && parsedBranch > 0
      ? parsedBranch
      : undefined;

  const res = await fetchTaxInvoicesPage({ branchId });
  const page = res.success
    ? res.data
    : { items: [], hasMore: false, nextCursor: null };
  const invoices = (page?.items ?? []) as InvoiceRow[];
  const initialHasMore = page?.hasMore ?? false;
  const initialNextCursor = (page?.nextCursor ?? null) as TaxInvoiceCursor | null;

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      <InvoiceList
        initialInvoices={invoices}
        initialHasMore={initialHasMore}
        initialNextCursor={initialNextCursor}
        branchId={branchId}
      />
    </AppPage>
  );
}
