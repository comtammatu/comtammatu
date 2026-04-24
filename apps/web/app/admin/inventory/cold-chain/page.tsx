import { redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { getAuthContextWithPermission } from "@/inventory/_lib/auth";
import { getCategoryReviewPolicies } from "@/inventory/catalog-policy-actions";
import { ColdChainClient } from "./cold-chain-client";

export const dynamic = "force-dynamic";

export default async function ColdChainAdminPage() {
  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.INVENTORY_CATALOG_REVIEW_POLICY_SET,
  );
  if (!ctx) redirect("/");

  const result = await getCategoryReviewPolicies();
  const rows = result.success && result.data ? result.data : [];

  return <ColdChainClient initial={rows} />;
}
