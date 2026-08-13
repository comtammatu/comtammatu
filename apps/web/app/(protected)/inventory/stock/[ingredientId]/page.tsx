import { notFound, redirect } from "next/navigation";

export default async function StockIngredientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ingredientId: string }>;
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const { ingredientId: rawIngredientId } = await params;
  const ingredientId = Number(rawIngredientId);
  if (!Number.isInteger(ingredientId) || ingredientId <= 0) notFound();

  const sp = await searchParams;
  const branchQuery = sp.branch ? `&branch=${sp.branch}` : "";
  redirect(
    `/inventory/stock?ingredientId=${ingredientId}&mode=view${branchQuery}`,
  );
}
