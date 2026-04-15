import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

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
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 pt-[max(0px,env(safe-area-inset-top,0px))]">
      <div className="mx-auto flex min-h-18 w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="min-w-0 space-y-1.5">
          <div className="surface-chip">
            <Sparkles className="size-3.5" />
            Cổng nhân viên
          </div>
          <p className="truncate text-base font-semibold tracking-tight text-foreground">
            {branchName ?? "Không gian cá nhân"}
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-full px-3 py-1">
          {roleLabel}
        </Badge>
      </div>
    </header>
  );
}
