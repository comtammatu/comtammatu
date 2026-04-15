import { Heart } from "lucide-react";
import {
  EmptyState,
  PageContainer,
  PageHeader,
} from "@/components/foundation/ui-patterns";

export default function CrmPage() {
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Phân hệ ERP"
        title="Khách hàng"
      />
      <EmptyState
        icon={<Heart className="size-8 text-primary" />}
        title="Tính năng đang phát triển"
        className="border-dashed bg-muted/20"
      />
    </PageContainer>
  );
}
