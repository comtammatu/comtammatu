import {
  PageContainer,
  PageHeader,
} from "@comtammatu/ui/components/admin-patterns";
import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Tài chính"
        title="Báo cáo tài chính"
      />
      <StatementsClient />
    </PageContainer>
  );
}
