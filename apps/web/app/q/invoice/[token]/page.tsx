import { notFound } from "next/navigation";
import { BrandMascot } from "@/components/brand";
import { ForceLightMode } from "@/components/force-light-mode";
import { AppPage } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { getInvoiceBuyerRequest } from "@lib/hddt/invoice-buyer-request-server";
import { invoiceBuyer } from "@lib/messages/invoice-buyer";
import { InvoiceBuyerForm } from "./invoice-buyer-form";
import { InvoiceBuyerOrderCard } from "./invoice-buyer-order-card";

export const dynamic = "force-dynamic";

function StatusPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <AppPage
      as="main"
      id="main-content"
      tabIndex={-1}
      width="narrow"
      density="compact"
      mobile
      padded={false}
      className="theme-light-only flex min-h-dvh flex-col bg-background text-foreground"
      contentClassName="min-h-0 flex-1 justify-center px-3 py-6"
    >
      <ForceLightMode />
      <Item variant="outline" className="bg-card">
        <ItemContent className="items-center gap-3 text-center">
          <BrandMascot decorative size="sm" />
          <ItemTitle className="text-lg">{title}</ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
      </Item>
    </AppPage>
  );
}

export default async function InvoiceBuyerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();

  const request = await getInvoiceBuyerRequest(token);
  if (!request) notFound();

  if (request.state === "submitted") {
    return (
      <StatusPage
        title={invoiceBuyer.submittedTitle}
        description={invoiceBuyer.submittedDescription}
      />
    );
  }
  if (request.state === "expired") {
    return (
      <StatusPage
        title={invoiceBuyer.expiredTitle}
        description={invoiceBuyer.expiredDescription}
      />
    );
  }
  if (request.state === "closed") {
    return (
      <StatusPage
        title={invoiceBuyer.closedTitle}
        description={invoiceBuyer.closedDescription}
      />
    );
  }
  if (request.state === "not_required") {
    return (
      <StatusPage
        title={invoiceBuyer.notRequiredTitle}
        description={invoiceBuyer.notRequiredDescription}
      />
    );
  }

  return (
    <AppPage
      as="main"
      id="main-content"
      tabIndex={-1}
      width="narrow"
      density="compact"
      mobile
      padded={false}
      className="theme-light-only flex min-h-dvh flex-col bg-background text-foreground"
      contentClassName="min-h-0 flex-1 gap-2 px-3 py-4"
    >
      <ForceLightMode />
      <InvoiceBuyerOrderCard
        branchName={request.branchName}
        orderNumber={request.orderNumber}
        summary={request.summary}
      />
      <InvoiceBuyerForm token={token} expiresAt={request.expiresAt} />
    </AppPage>
  );
}
