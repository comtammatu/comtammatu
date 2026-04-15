import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { redirect } from "next/navigation";

export async function MobileHeader() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect(buildLoginBlockedStatePath());

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;

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
    <header className="sticky top-0 z-30 border-b bg-background pt-[max(0px,env(safe-area-inset-top,0px))]">
      <div className="mx-auto flex min-h-15 w-full max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Cổng nhân viên
          </p>
          <p className="truncate text-sm font-semibold text-foreground">
            {branchName ?? "Không gian cá nhân"}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">
          {roleLabel}
        </Badge>
      </div>
    </header>
  );
}
