import { notFound } from "next/navigation";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { getSelfOrderSnapshot } from "@lib/self-order/server";
import { selfOrderTokenSchema } from "@lib/self-order/contracts";
import { AppPage } from "@/components/surface";
import { BrandMascot } from "@/components/brand";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SelfOrderClient } from "./self-order-client";

function UnavailablePage({ description }: { description: string }) {
  return (
    <AppPage
      as="main"
      id="main-content"
      tabIndex={-1}
      width="narrow"
      density="compact"
      mobile
      padded={false}
      className="flex min-h-dvh flex-col bg-background"
      contentClassName="min-h-0 flex-1 justify-center px-3 py-6"
    >
      <Item variant="outline" className="bg-card">
        <ItemContent className="items-center gap-3 text-center">
          <BrandMascot decorative size="sm" />
          <ItemTitle className="text-lg">
            {SELF_ORDER_VI.unavailableTitle}
          </ItemTitle>
          <ItemDescription>{description}</ItemDescription>
        </ItemContent>
      </Item>
    </AppPage>
  );
}

export default async function SelfOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const parsedToken = selfOrderTokenSchema.safeParse(rawToken);
  if (!parsedToken.success) notFound();

  const snapshot = await getSelfOrderSnapshot(parsedToken.data);
  if (!snapshot.ok) return <UnavailablePage description={snapshot.message} />;
  if (!snapshot.data.ok) {
    const description =
      snapshot.data.code === "self_order_disabled"
        ? SELF_ORDER_VI.unavailableDisabledDescription
        : snapshot.data.code === "pos_session_closed"
          ? SELF_ORDER_VI.unavailablePosClosedDescription
          : SELF_ORDER_VI.unavailableInvalidTokenDescription;
    return <UnavailablePage description={description} />;
  }

  return (
    <SelfOrderClient token={parsedToken.data} initialSnapshot={snapshot.data} />
  );
}
