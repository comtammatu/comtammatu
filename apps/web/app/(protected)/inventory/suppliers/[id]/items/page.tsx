import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";

export default async function SupplierItemsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supplierId = Number((await params).id);
  if (!Number.isSafeInteger(supplierId) || supplierId <= 0) notFound();

  const canRead = await currentUserHasPermissionAny(
    PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_READ,
  );
  if (!canRead) redirect("/access-denied?reason=insufficient-permission");

  redirect(`/inventory/suppliers?supplierId=${supplierId}`);
}
