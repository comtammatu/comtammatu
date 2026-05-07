import Link from "next/link";
import { User as IconUser } from "lucide-react";
import { ROLE_LABEL_VI } from "@comtammatu/shared/auth";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { BrandMark } from "@/components/brand";
import { getEmployeeContext } from "../_lib/employee-context";
import { loadAuthState } from "@/_lib/auth";
import { EmployeeDesktopNav } from "./bottom-nav";
import { messages } from "@lib/messages";

export async function MobileHeader() {
  const { claims } = await loadAuthState();
  const ctx = await getEmployeeContext();
  const copy = messages.employee.header;

  const roleLabel = ROLE_LABEL_VI[claims.user_role] ?? claims.user_role;
  const branchName = ctx?.branchName ?? null;

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-3 py-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background p-1">
            <BrandMark decorative className="size-full" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold">{copy.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName ?? copy.noBranch}
            </p>
          </div>
        </div>
        <div className="hidden min-w-0 flex-1 justify-center lg:flex">
          <EmployeeDesktopNav />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="icon-sm"
            aria-label={copy.profileAria}
          >
            <Link href="/employee/profile">
              <IconUser className="size-4" />
            </Link>
          </Button>
          <Badge variant="outline" className="hidden sm:inline-flex">
            {roleLabel}
          </Badge>
          <Badge
            variant={branchName ? "success" : "warning"}
            className="hidden sm:inline-flex"
          >
            {branchName ? copy.branch : copy.missingBranch}
          </Badge>
        </div>
      </div>
    </header>
  );
}
