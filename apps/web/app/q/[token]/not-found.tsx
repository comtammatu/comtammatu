import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
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
          <ItemDescription>
            {SELF_ORDER_VI.unavailableDescription}
          </ItemDescription>
        </ItemContent>
      </Item>
    </AppPage>
  );
}
