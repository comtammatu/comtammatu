import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import {
  cancelStockRequest,
  submitStockRequest,
} from "@/(protected)/inventory/stock-request-actions";
import { AddStockRequestLineForm } from "./add-stock-request-line-form";
import { messages } from "@lib/messages";

const copy = messages.inventory.stockRequests.branch;

export default async function BranchStockRequestDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  const requestId = Number(rawId);
  if (branchId == null || !Number.isInteger(requestId) || requestId <= 0) {
    notFound();
  }

  const scopedBranchId = branchId;
  const scopedRequestId = requestId;

  const { supabase, claims } = await loadAuthState();
  const context = await resolveBranchContext(supabase, claims, scopedBranchId);
  if (!context) notFound();

  const { data: header } = await supabase
    .from("stock_requests")
    .select("id, request_number, status, notes")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", scopedBranchId)
    .eq("id", scopedRequestId)
    .maybeSingle();

  if (!header) notFound();
  const req = header as {
    id: number;
    request_number: string;
    status: string;
    notes: string | null;
  };

  const { data: items } = await supabase
    .from("stock_request_items")
    .select(
      "id, quantity, fulfill_site_kind, status, ingredient_id, ingredients(name)",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("request_id", scopedRequestId)
    .order("id");

  const lines = (items ?? []) as Array<{
    id: number;
    quantity: number;
    fulfill_site_kind: string;
    status: string;
    ingredients: { name: string } | null;
  }>;

  async function submitAction() {
    "use server";
    await submitStockRequest({
      branchId: scopedBranchId,
      requestId: scopedRequestId,
    });
  }

  async function cancelAction() {
    "use server";
    await cancelStockRequest({
      branchId: scopedBranchId,
      requestId: scopedRequestId,
    });
  }

  return (
    <BranchOperatorPage
      title={req.request_number}
      description={copy.statusDescription(req.status)}
    >
      <div className="mb-4">
        <Button
          variant="ghost"
          size="touch"
          render={
            <Link href={`/br/${scopedBranchId}/stock/requests`} />
          }
        >
          {copy.backToList}
        </Button>
      </div>

      {req.status === "draft" ? (
        <AddStockRequestLineForm
          branchId={scopedBranchId}
          requestId={scopedRequestId}
        />
      ) : null}

      <ul className="mb-6 flex flex-col gap-2">
        {lines.map((line) => (
          <li key={line.id}>
            <Item variant="outline" size="sm">
              <ItemContent>
                <ItemTitle>
                  {line.ingredients?.name ?? `NL #${line.id}`}
                </ItemTitle>
                <ItemDescription>
                  {copy.lineDescription(
                    line.quantity,
                    line.fulfill_site_kind,
                    line.status,
                  )}
                </ItemDescription>
              </ItemContent>
            </Item>
          </li>
        ))}
        {lines.length === 0 ? (
          <li className="text-sm text-muted-foreground">{copy.emptyLines}</li>
        ) : null}
      </ul>

      {req.status === "draft" ? (
        <div className="flex flex-col gap-2">
          <form action={submitAction}>
            <Button type="submit" size="touch" className="w-full">
              {copy.submit}
            </Button>
          </form>
          <form action={cancelAction}>
            <Button
              type="submit"
              size="touch"
              variant="outline"
              className="w-full"
            >
              {copy.cancel}
            </Button>
          </form>
        </div>
      ) : null}
    </BranchOperatorPage>
  );
}
