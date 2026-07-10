import { notFound } from "next/navigation";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { getSelfOrderSnapshot } from "@lib/self-order/server";
import { selfOrderTokenSchema } from "@lib/self-order/contracts";
import { AppPage } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SelfOrderClient } from "./self-order-client";

export default async function SelfOrderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: rawToken } = await params;
  const parsedToken = selfOrderTokenSchema.safeParse(rawToken);
  if (!parsedToken.success) notFound();

  const snapshot = await getSelfOrderSnapshot(parsedToken.data);
  if (!snapshot.ok) {
    return (
      <AppPage
        as="main"
        id="main-content"
        width="narrow"
        density="compact"
        mobile
        className="min-h-dvh bg-background"
        contentClassName="min-h-dvh justify-center"
      >
        <Item variant="outline" className="bg-card">
          <ItemContent className="items-center text-center">
            <ItemTitle className="text-lg">
              {SELF_ORDER_VI.unavailableTitle}
            </ItemTitle>
            <ItemDescription>{snapshot.message}</ItemDescription>
          </ItemContent>
        </Item>
      </AppPage>
    );
  }

  return (
    <SelfOrderClient token={parsedToken.data} initialSnapshot={snapshot.data} />
  );
}
