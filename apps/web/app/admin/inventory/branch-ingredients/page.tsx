import { notFound } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { fetchBranchesForAllowlist } from "../branch-ingredients-actions";
import { BranchIngredientsClient } from "./branch-ingredients-client";

export default async function BranchIngredientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;
  if (claims?.user_role !== "super_manager") {
    notFound();
  }

  const brRes = await fetchBranchesForAllowlist();
  const branches = brRes.success ? (brRes.data as never[]) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Mở nguyên liệu theo chi nhánh
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trụ sở quyết định chi nhánh nào được dùng nguyên liệu nào trong vận
          hành kho.
        </p>
      </div>
      <BranchIngredientsClient branches={branches} />
    </div>
  );
}
