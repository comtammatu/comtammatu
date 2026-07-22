import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { BrandMascot } from "@/components/brand";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { AppPage } from "@/components/surface";

export default function SelfOrderNotFound() {
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
          <ItemDescription>
            {SELF_ORDER_VI.unavailableInvalidTokenDescription}
          </ItemDescription>
        </ItemContent>
      </Item>
    </AppPage>
  );
}
