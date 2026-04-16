import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  buildLoginBlockedStatePath,
  extractClaims,
  ROLE_LABEL_VI,
} from "@comtammatu/shared/auth";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Badge } from "@comtammatu/ui/components/badge";

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
    <header className="sticky top-0 z-30 px-3 py-3 backdrop-blur sm:px-4 lg:px-6">
      <div className="mx-auto max-w-6xl">
        <Card className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <Badge variant="secondary">
                  <Sparkles className="size-3.5" />
                  Cổng nhân viên
                </Badge>
                <div className="space-y-1">
                  <p className="font-heading text-2xl font-semibold tracking-tight">
                    {branchName ?? "Không gian cá nhân"}
                  </p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Bắt đầu ca làm, xem lịch, chấm công và mở đúng workspace
                    theo vai trò hiện tại.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{roleLabel}</Badge>
                <Badge variant={branchName ? "success" : "warning"}>
                  {branchName ? "Đã gắn chi nhánh" : "Chưa gắn chi nhánh"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </header>
  );
}
