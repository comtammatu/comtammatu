import { redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { BranchTable } from "./branch-table";
import { AddBranchButton } from "./add-branch-button";

export default async function BranchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const claims = user ? extractClaims(user.app_metadata) : null;
  if (
    !claims ||
    !["owner", "super_manager"].includes(claims.user_role)
  ) {
    redirect("/admin/settings/tables");
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, address, phone, is_active, is_headquarters")
    .order("is_headquarters", { ascending: false })
    .order("name");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Chi nhánh</h2>
          <p className="text-sm text-muted-foreground">
            {branches?.length ?? 0} chi nhánh
          </p>
        </div>
        <AddBranchButton />
      </div>
      <BranchTable branches={branches ?? []} />
    </div>
  );
}
