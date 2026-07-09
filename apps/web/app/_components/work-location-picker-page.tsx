import { notFound } from "next/navigation";
import { unstable_cache } from "next/cache";
import {
  Building2 as IconBuilding2,
  ChefHat as IconChefHat,
  Wallet as IconWallet,
  Warehouse as IconWarehouse,
} from "lucide-react";
import { canAccess, MODULE_ACL } from "@comtammatu/shared/auth";
import {
  APP_COPY_VI,
  getSiteKindLabelVi,
  resolveSiteKind,
  type SiteKind,
} from "@comtammatu/shared/labels";
import { createServiceClient } from "@comtammatu/database";
import {
  AppEmptyState,
  AppLinkCard,
  AppPage,
  AppPageHeader,
  LinkCardGrid,
} from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import {
  selectOperatorBranchScope,
  type OperatorBranchOption,
} from "@/_lib/branch-context";

const getCachedOperatorBranches = unstable_cache(
  async (tenantId: number): Promise<OperatorBranchOption[]> => {
    const sb = createServiceClient();
    const { data, error } = await sb
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("id");

    if (error) throw new Error(`fetchOperatorBranches: ${error.message}`);
    return (data ?? []) as OperatorBranchOption[];
  },
  ["operator-branches-v2"],
  {
    revalidate: 300,
    tags: ["branches-list"],
  },
);

const SITE_KIND_ORDER: Record<SiteKind, number> = {
  branch: 0,
  central_kitchen: 1,
  central_supply: 2,
};

function siteIcon(kind: SiteKind) {
  if (kind === "central_kitchen") return <IconChefHat />;
  if (kind === "central_supply") return <IconWarehouse />;
  return <IconBuilding2 />;
}

export async function WorkLocationPickerPage() {
  const { claims } = await loadAuthState();

  let data: OperatorBranchOption[];
  try {
    data = await getCachedOperatorBranches(claims.tenant_id);
  } catch {
    notFound();
  }

  const { allowedBranches } = selectOperatorBranchScope(claims, data, null);
  const showOfficeCard = canAccess(claims.user_role, "finance");
  const orderedSites = [...allowedBranches].sort(
    (a, b) =>
      SITE_KIND_ORDER[resolveSiteKind(a)] - SITE_KIND_ORDER[resolveSiteKind(b)] ||
      a.id - b.id,
  );

  return (
    <AppPage density="compact" width="default">
      <AppPageHeader title={MODULE_ACL.branch_picker.label} />
      {orderedSites.length > 0 || showOfficeCard ? (
        <LinkCardGrid className="lg:grid-cols-4">
          {orderedSites.map((site) => (
            <AppLinkCard
              key={site.id}
              href={`/br/${site.id}`}
              title={site.name}
              description={getSiteKindLabelVi(resolveSiteKind(site))}
              icon={siteIcon(resolveSiteKind(site))}
              ctaLabel="Chọn"
            />
          ))}
          {showOfficeCard ? (
            <AppLinkCard
              href={MODULE_ACL.finance.path}
              title={APP_COPY_VI.officePlaneTitle}
              description={APP_COPY_VI.officePlaneDescription}
              icon={<IconWallet />}
              tone="secondary"
              ctaLabel={APP_COPY_VI.officePlaneCta}
            />
          ) : null}
        </LinkCardGrid>
      ) : (
        <AppEmptyState title={MODULE_ACL.branch_picker.label} />
      )}
    </AppPage>
  );
}
