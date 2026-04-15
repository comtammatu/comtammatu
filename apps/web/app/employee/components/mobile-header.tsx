import { redirect } from "next/navigation";
import { Building2, Sparkles } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  ROLE_LABEL_VI,
  buildLoginBlockedStatePath,
  extractClaims,
} from "@comtammatu/shared/auth";

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
    <header className="safe-top-pad sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-3 pt-3 sm:px-4 lg:px-6">
        <div className="surface-panel-strong overflow-hidden px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-secondary-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Cổng nhân viên
              </div>
              <div className="space-y-1">
                <p className="text-2xl font-semibold tracking-tight text-foreground">
                  {branchName ?? "Không gian cá nhân"}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  Nhịp làm việc trong ngày, ca làm và tác vụ tiền tuyến của bạn.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="ops-chip">
                <Building2 className="size-3.5 text-primary" />
                {roleLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
