import { PageHero } from "@/components/page-hero";
import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHero eyebrow="Tài chính" title="Báo cáo tài chính" />
      <StatementsClient />
    </div>
  );
}
