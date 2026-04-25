import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { getEmployeeContext } from "../_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";

export async function MobileHeader() {
  const { claims } = await loadAuthState();
  const ctx = await getEmployeeContext();

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;
  const branchName = ctx?.branchName ?? null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold">Cổng nhân viên</p>
          <p className="truncate text-xs text-muted-foreground">
            {branchName ?? "Chưa gắn chi nhánh"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline">{roleLabel}</Badge>
          <Badge variant={branchName ? "success" : "warning"}>
            {branchName ? "Chi nhánh" : "Thiếu chi nhánh"}
          </Badge>
        </div>
      </div>
    </header>
  );
}
