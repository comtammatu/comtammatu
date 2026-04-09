import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ChefHat,
  CreditCard,
  DoorOpen,
  Home,
  LogOut,
  Monitor,
} from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaims, canAccess } from "@comtammatu/shared/auth";

export default async function EmployeePage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) redirect("/login");

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) redirect("/login");

  const canPos = canAccess(claims.user_role, "pos");
  const canKds = canAccess(claims.user_role, "kds");
  const branchId = claims.branch_id;

  let branchIsHq = false;
  if (branchId) {
    const { data } = await supabase
      .from("branches")
      .select("is_headquarters")
      .eq("id", branchId)
      .eq("tenant_id", claims.tenant_id)
      .maybeSingle();
    branchIsHq = data?.is_headquarters === true;
  }

  const posHref = branchId ? `/br/${branchId}/pos` : "/employee";
  const kdsHref = branchId ? `/br/${branchId}/kds` : "/employee";
  const posDisabled = !canPos || !branchId || branchIsHq;
  const kdsDisabled = !canKds || !branchId || branchIsHq;

  return (
    <div className="flex flex-col gap-6">
      {/* Quick actions */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Truy c\u1EADp nhanh
        </p>
        <div className="flex flex-col gap-3">
          {posDisabled ? (
            <button
              disabled
              className="touch-target-lg flex h-16 cursor-not-allowed items-center gap-4 rounded-xl border border-border bg-muted/40 px-5 opacity-50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">V\u00E0o POS</p>
                <p className="text-xs text-muted-foreground">
                  M\u00E0n h\u00ECnh b\u00E1n h\u00E0ng
                </p>
              </div>
            </button>
          ) : (
            <Link
              href={posHref}
              className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Monitor className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">V\u00E0o POS</p>
                <p className="text-xs text-muted-foreground">
                  M\u00E0n h\u00ECnh b\u00E1n h\u00E0ng
                </p>
              </div>
            </Link>
          )}

          {kdsDisabled ? (
            <button
              disabled
              className="touch-target-lg flex h-16 cursor-not-allowed items-center gap-4 rounded-xl border border-border bg-muted/40 px-5 opacity-50"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ChefHat className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">V\u00E0o KDS</p>
                <p className="text-xs text-muted-foreground">
                  M\u00E0n h\u00ECnh b\u1EBFp
                </p>
              </div>
            </button>
          ) : (
            <Link
              href={kdsHref}
              className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <ChefHat className="size-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold">V\u00E0o KDS</p>
                <p className="text-xs text-muted-foreground">
                  M\u00E0n h\u00ECnh b\u1EBFp
                </p>
              </div>
            </Link>
          )}
        </div>

        {!branchId && (canPos || canKds) && (
          <p className="mt-3 text-xs text-muted-foreground">
            T\u00E0i kho\u1EA3n ch\u01B0a g\u1EAFn chi nh\u00E1nh \u2014
            li\u00EAn h\u1EC7 qu\u1EA3n l\u00FD \u0111\u1EC3 \u0111\u01B0\u1EE3c
            ph\u00E2n c\u00F4ng.
          </p>
        )}
        {branchId && branchIsHq && (canPos || canKds) && (
          <p className="mt-3 text-xs text-muted-foreground">
            Tr\u1EE5 s\u1EDF kh\u00F4ng c\u00F3 s\u00E0n POS/KDS. Vui l\u00F2ng
            d\u00F9ng trang qu\u1EA3n tr\u1ECB.
          </p>
        )}
      </div>

      {/* HR Portal */}
      <div>
        <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Nh\u00E2n s\u1EF1
        </p>
        <div className="flex flex-col gap-3">
          <Link
            href="/employee/attendance"
            className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <DoorOpen className="size-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">Ch\u1EA5m c\u00F4ng</p>
              <p className="text-xs text-muted-foreground">
                Xem l\u1ECBch s\u1EED ch\u1EA5m c\u00F4ng c\u1EE7a b\u1EA1n
              </p>
            </div>
          </Link>

          <Link
            href="/employee/payslip"
            className="touch-target-lg focus-ring-standard flex h-16 items-center gap-4 rounded-xl border border-border bg-card px-5 shadow-sm transition-colors hover:bg-muted/40"
          >
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
              <CreditCard className="size-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold">
                Phi\u1EBFu l\u01B0\u01A1ng
              </p>
              <p className="text-xs text-muted-foreground">
                Xem l\u01B0\u01A1ng & thu\u1EBF TNCN
              </p>
            </div>
          </Link>

          <div className="flex h-12 items-center gap-3 rounded-lg border border-dashed border-border px-4 text-sm text-muted-foreground">
            <Home className="size-4 shrink-0" />
            H\u1ED3 s\u01A1 c\u00E1 nh\u00E2n (s\u1EAFp c\u00F3)
          </div>
        </div>
      </div>

      {/* Logout */}
      <form action="/api/auth/signout" method="post" className="mt-2">
        <button
          type="submit"
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <LogOut className="size-3.5" />
          \u0110\u0103ng xu\u1EA5t
        </button>
      </form>
    </div>
  );
}
