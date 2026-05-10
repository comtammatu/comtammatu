import { redirect } from "next/navigation";
import { appendInventorySearchParams } from "../../_lib/paths";

export default async function InventoryMobileDraftsAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(appendInventorySearchParams("/inventory/drafts", await searchParams));
}
