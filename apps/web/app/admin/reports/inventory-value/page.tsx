import { createClient } from "@comtammatu/database/supabase/server";
import {
  extractClaims,
  getInventoryValueVisibility,
} from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { PageContainer, PageHeader } from "@/components/v2/patterns";
import { InventoryValuePanel } from "@/inventory/inventory-value-panel";

export default async function InventoryValueReportPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaims(session.user.app_metadata)
    : null;
  const inventoryValueVisibility = claims
    ? getInventoryValueVisibility(claims.user_role)
    : { system: false, area: false, branch: false };

  return (
    <PageContainer>
      <PageHeader
        eyebrow={APP_COPY_VI.executiveReporting}
        title="Giá trị tồn kho"
      />
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </PageContainer>
  );
}
