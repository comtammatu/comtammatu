import {
  PageContainer,
  PageHeader,
} from "@/components/foundation/ui-patterns";
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
