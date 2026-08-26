import { notFound } from "next/navigation";
import { AppBackLink } from "@/components/surface";
import {
  fetchCategories,
  type CategoryRow,
} from "@/(protected)/inventory/settings/categories/categories-actions";
import { messages } from "@lib/messages";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { CatalogPageShell } from "../catalog-page-shell";
import { CatalogCategoriesClient } from "./catalog-categories-client";

const copy = messages.catalog.categories;

export default async function OperatorCatalogCategoriesPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  return (
    <CatalogPageShell
      title={copy.title}
      back={
        branchId != null ? (
          <AppBackLink href={`/br/${branchId}/stock/catalog`} />
        ) : undefined
      }
    >
      <CatalogCategoriesBody params={params} />
    </CatalogPageShell>
  );
}

async function CatalogCategoriesBody({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  if (parseOperatorBranchId(rawBranchId) == null) notFound();

  const res = await fetchCategories();
  const rows: CategoryRow[] = res.success ? (res.data ?? []) : [];

  return <CatalogCategoriesClient rows={rows} />;
}
