import { PageContainer, PageHeader } from "@/components/patterns";
import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <PageContainer>
      <PageHeader eyebrow="Tài chính" title="Báo cáo tài chính" />
      <StatementsClient />
    </PageContainer>
  );
}
