import { AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchTaxInvoices } from "../actions";
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

  const res = await fetchTaxInvoices(branchId);
  const invoices = (res.success ? (res.data ?? []) : []) as InvoiceRow[];

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      <InvoiceList initialInvoices={invoices} />
    </AppPage>
  );
}
