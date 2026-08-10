import { notFound } from "next/navigation";
import { BrandMascot } from "@/components/brand";
import { AppPage } from "@/components/surface";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { loadFeedbackQrPublicContext } from "@lib/feedback/server";
import { feedbackCopy } from "@lib/messages/feedback";
import { FeedbackForm } from "./feedback-form";

export default async function FeedbackTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const context = await loadFeedbackQrPublicContext(token);
  if (!context) notFound();

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
        <ItemContent className="gap-4">
          <div className="flex justify-center">
            <BrandMascot decorative size="sm" />
          </div>
          <FeedbackForm
            token={context.token}
            branchName={context.branchName}
            qrLabel={context.label}
            branchPhone={context.branchPhone}
            googleReviewUrl={context.googleReviewUrl}
          />
        </ItemContent>
      </Item>
      <ItemTitle className="sr-only">{feedbackCopy.guestTitle}</ItemTitle>
      <ItemDescription className="sr-only">
        {feedbackCopy.guestTitle}
      </ItemDescription>
    </AppPage>
  );
}
