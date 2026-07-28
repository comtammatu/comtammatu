import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { AppEmptyState } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";
import { createStockRequestDraft } from "@/(protected)/inventory/stock-request-actions";
import { messages } from "@lib/messages";

const copy = messages.inventory.stockRequests.branch;

export default async function BranchStockRequestsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, branchId);
  if (!context) notFound();

  const scopedBranchId = branchId;

  const { data: rows } = await supabase
    .from("stock_requests")
    .select("id, request_number, status, created_at, submitted_at")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", scopedBranchId)
    .order("created_at", { ascending: false })
    .limit(50);

  const list = (rows ?? []) as Array<{
    id: number;
    request_number: string;
    status: string;
    created_at: string;
  }>;

  async function createDraft() {
    "use server";
    const result = await createStockRequestDraft({ branchId: scopedBranchId });
    if (result.success && result.data) {
      const { redirect } = await import("next/navigation");
      redirect(
        `/br/${scopedBranchId}/stock/requests/${result.data.requestId}`,
      );
    }
  }

  return (
    <BranchOperatorPage
      title={copy.listTitle}
      description={copy.listDescription}
    >
      <div className="mb-4">
        <form action={createDraft}>
          <Button type="submit" size="touch">
            {copy.createDraft}
          </Button>
        </form>
      </div>

      {list.length === 0 ? (
        <AppEmptyState
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((row) => (
            <li key={row.id}>
              <Button
                variant="outline"
                size="touch"
                className="w-full justify-between"
                render={
                  <Link
                    href={`/br/${scopedBranchId}/stock/requests/${row.id}`}
                  />
                }
              >
                <span>{row.request_number}</span>
                <span className="text-muted-foreground">{row.status}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </BranchOperatorPage>
  );
}
