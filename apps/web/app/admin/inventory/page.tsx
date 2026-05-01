import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck as IconShieldCheck, Snowflake as IconSnowflake, Clock as IconClock, ReceiptText as IconReceipt2, Flag as IconFlag, ArrowRight as IconArrowRight } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { loadAuthState } from "@/_lib/auth";
import { canAccess } from "@comtammatu/shared/auth";

export const dynamic = "force-dynamic";

/**
 * Inventory admin hub (nav wiring sprint).
 *
 * Landing page for `/admin/inventory` — lists every admin-only tool
 * shipped across the inventory redesign (S10 / S12 / S15-min) so QLV +
 * admin users can find them from the sidebar. Each card links to a tool
 * whose detail page keeps its own fine-grained permission gate.
 */
export default async function InventoryAdminHubPage() {
  const { claims } = await loadAuthState();
  if (!canAccess(claims.user_role, "inventory_admin")) redirect("/");

  return (
    <div className="container mx-auto max-w-5xl space-y-5 py-6">
      <header>
        <h1 className="text-2xl font-semibold">Cấu hình kho</h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <ToolCard
          href="/admin/inventory/feature-flags"
          title="Feature flags"
          icon={<IconFlag className="size-5 text-warning-foreground" />}
          badge={{ label: "Nav wiring", tone: "border-warning/40 bg-warning/15 text-warning-foreground" }}
        />
        <ToolCard
          href="/admin/inventory/trust"
          title="Trust leaderboard"
          icon={<IconShieldCheck className="size-5 text-tier-elite" />}
          badge={{ label: "S15-min", tone: "border-tier-elite/40 bg-tier-elite/10 text-tier-elite" }}
        />
        <ToolCard
          href="/admin/inventory/cold-chain"
          title="Cold-chain policy"
          icon={<IconSnowflake className="size-5 text-info" />}
          badge={{ label: "S10", tone: "border-info/40 bg-info/10 text-info" }}
        />
        <ToolCard
          href="/admin/inventory/express-windows"
          title="Express windows"
          icon={<IconClock className="size-5 text-warning-foreground" />}
          badge={{ label: "S10", tone: "border-warning/40 bg-warning/15 text-warning-foreground" }}
        />
        <ToolCard
          href="/admin/accounting/periods"
          title="Kỳ kế toán"
          icon={<IconReceipt2 className="size-5 text-success" />}
          badge={{ label: "S12", tone: "border-success/40 bg-success/10 text-success" }}
        />
      </div>
    </div>
  );
}

interface ToolCardProps {
  href: string;
  title: string;
  icon: React.ReactNode;
  badge: { label: string; tone: string };
}

function ToolCard({ href, title, icon, badge }: ToolCardProps) {
  return (
    <Link
      href={href}
      className="group block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <Card className="h-full transition hover:border-primary/40 hover:shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-base">{title}</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={badge.tone}>
                {badge.label}
              </Badge>
              <IconArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
