import Link from "next/link";
import { redirect } from "next/navigation";
import { STOCK_REQUEST_FULFILL_ROLES } from "@comtammatu/shared/auth";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  AppEmptyState,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { messages } from "@lib/messages";

const stockRequestCopy = messages.inventory.stockRequests;
const copy = stockRequestCopy.inbox;

export default async function InventoryStockRequestsInboxPage() {
  const { supabase, claims } = await loadAuthState();
  if (
    !STOCK_REQUEST_FULFILL_ROLES.includes(
      claims.user_role as (typeof STOCK_REQUEST_FULFILL_ROLES)[number],
    )
  ) {
    redirect("/inventory");
  }

  const { data } = await supabase
    .from("stock_requests")
    .select("id, request_number, status, branch_id")
    .eq("tenant_id", claims.tenant_id)
    .in("status", ["submitted", "partially_fulfilled"])
    .order("id", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as Array<{
    id: number;
    request_number: string;
    status: string;
    branch_id: number;
  }>;

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title={copy.title} description={copy.description} />

      {rows.length === 0 ? (
        <AppEmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Item variant="outline">
                <ItemContent>
                  <ItemTitle>{row.request_number}</ItemTitle>
                  <ItemDescription>
                    {stockRequestCopy.statusLabel(row.status)}
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button
                    size="sm"
                    variant="outline"
                    render={
                      <Link href={`/inventory/stock-requests/${row.id}`} />
                    }
                  >
                    {copy.openButton}
                  </Button>
                </ItemActions>
              </Item>
            </li>
          ))}
        </ul>
      )}
    </AppPage>
  );
}
