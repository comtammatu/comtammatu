import { AlertTriangle as IconAlert } from "lucide-react";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { messages } from "@lib/messages";
import { fetchOrphanPaidOrders } from "../../actions";
import { OrphansClient } from "./orphans-client";

const copy = messages.finance.orphansPage;

export default async function OrphanInvoicesPage() {
  const res = await fetchOrphanPaidOrders();

  return (
    <AppPage>
      <AppPageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.description}
      />
      {res.success ? (
        <OrphansClient rows={res.data ?? []} />
      ) : (
        <AppEmptyState
          mode="error"
          icon={<IconAlert />}
          title={copy.loadError}
          description={res.error ?? undefined}
        />
      )}
    </AppPage>
  );
}
