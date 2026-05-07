import { AppPage, AppPageHeader } from "@/components/surface";
import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <AppPage>
      <AppPageHeader eyebrow="Tài chính" title="Báo cáo tài chính" />
      <StatementsClient />
    </AppPage>
  );
}
