import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims } from "@comtammatu/shared/auth";
import { redirect } from "next/navigation";

const ROLE_LABELS: Record<string, string> = {
  owner: "Chu\u0309 he\u0323\u0302 tho\u0301\u0302ng",
  super_manager: "Qua\u0309n ly\u0301 to\u0309\u0302ng",
  area_manager: "Qua\u0309n ly\u0301 khu vu\u0323\u0302c",
  branch_manager: "Qua\u0309n ly\u0301 chi nha\u0301nh",
  cashier: "Thu nga\u0302n",
  waiter: "Phu\u0323c vu\u0323",
  chef: "Be\u0301\u0302p",
  office: "Va\u0306n pho\u0300ng",
};

export async function MobileHeader() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const roleLabel = ROLE_LABELS[claims.user_role] ?? claims.user_role;

  let branchName: string | null = null;
  if (claims.branch_id) {
    const { data } = await supabase
      .from("branches")
      .select("name")
      .eq("id", claims.branch_id)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchName = data?.name ?? null;
  }

  return (
    <header
      className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4"
      style={{
        paddingTop: "max(0px, env(safe-area-inset-top, 0px))",
      }}
    >
      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
        {roleLabel}
      </span>
      {branchName ? (
        <span className="truncate text-sm text-muted-foreground">
          {branchName}
        </span>
      ) : null}
    </header>
  );
}
