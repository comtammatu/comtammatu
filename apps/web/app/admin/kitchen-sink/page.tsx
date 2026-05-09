/**
 * Kitchen-sink — visual QA surface for matu-superapp baseline.
 *
 * Renders palette + typography + geometry + key components against the
 * matu-* token system so reviewers can verify the design system stays
 * intact before shipping. Mirrors matu-superapp/apps/backoffice_web/app/
 * admin/kitchen-sink/page.tsx pattern.
 *
 * Per DESIGN.md "Adding a primitive to @matu/ui without adding it to
 * kitchen-sink is incomplete work" — Inventory pilot extends this page
 * as redesigned components ship.
 */

import { TriangleAlert as IconAlertTriangle, Check as IconCheck, Plus as IconPlus, Search as IconSearch, ShoppingCart as IconShoppingCart, Truck as IconTruck } from "lucide-react";
import {
  EmptyState,
  PageSurface,
  SectionCard,
  ToolbarRow,
} from "@/components/matu-surface";

// Page lives under /admin/* whose layout calls loadAuthState() — that is a
// dynamic function (reads cookies). Force-dynamic prevents Next from trying
// to prerender it at build time (no session → loadAuthState throws). The page
// itself stays trivially static once rendered; cost is one render per visit.
export const dynamic = "force-dynamic";

export default function KitchenSinkPage() {
  return (
    <PageSurface
      eyebrow="QA · Visual"
      title="Kitchen sink — Mã Tư baseline"
      subtitle="Bảng hiển thị token + component theo matu-superapp DESIGN.md. Mở trước khi ship UI để xác nhận hệ thống vẫn nguyên vẹn."
    >
      <SectionCard title="Palette" description="9 brand + 6 semantic. Hex từ packages/design-tokens/tokens.json. Không hardcode hex ngoài tokens.">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Swatch label="background" className="bg-matu-background border border-matu-border" />
          <Swatch label="foreground" className="bg-matu-foreground" textOnDark />
          <Swatch label="card" className="bg-matu-card border border-matu-border" />
          <Swatch label="primary" className="bg-matu-primary" textOnDark />
          <Swatch label="secondary" className="bg-matu-secondary" />
          <Swatch label="muted" className="bg-matu-muted" />
          <Swatch label="accent" className="bg-matu-accent" textOnDark />
          <Swatch label="border" className="bg-matu-border" />
          <Swatch label="success" className="bg-matu-success" textOnDark />
          <Swatch label="warning" className="bg-matu-warning" textOnDark />
          <Swatch label="destructive" className="bg-matu-destructive" textOnDark />
          <Swatch label="info" className="bg-matu-info" textOnDark />
          <Swatch label="brand-terracotta" className="bg-matu-brand-terracotta" textOnDark />
          <Swatch label="brand-brown" className="bg-matu-brand-brown" textOnDark />
          <Swatch label="brand-herb" className="bg-matu-brand-herb" />
        </div>
      </SectionCard>

      <SectionCard title="Typography" description="Be Vietnam Pro. Type ramp h1 → caption.">
        <div className="space-y-3 font-matu-body">
          <p className="text-[28px] font-bold leading-[36px] text-matu-foreground">
            H1 — Cơm Tấm Má Tư · 28/36/700
          </p>
          <p className="text-[22px] font-semibold leading-[30px] text-matu-foreground">
            H2 — Vận hành nhà hàng · 22/30/600
          </p>
          <p className="text-[18px] font-semibold leading-[26px] text-matu-foreground">
            H3 — Tồn kho hôm nay · 18/26/600
          </p>
          <p className="text-[14px] leading-[22px] text-matu-foreground">
            Body backoffice — 14/22/400. Diacritics composed (đầy đủ dấu).
          </p>
          <p className="text-[16px] leading-[24px] text-matu-foreground">
            Body frontline — 16/24/400. Touch-safe density cho POS / KDS / employee.
          </p>
          <p className="text-[13px] font-medium leading-[18px] text-matu-foreground">
            Label — 13/18/500
          </p>
          <p className="text-[12px] leading-[18px] text-matu-muted-foreground">
            Caption — 12/18/400 muted
          </p>
          <p className="font-mono text-[14px] leading-[22px] tabular-nums text-matu-foreground">
            Mono · 1.234.567 ₫ · GRN-2026-0042 · 14/22/500 tabular-nums
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Geometry" description="Radius (0/4/8/12/999), spacing 4px grid, border-first elevation.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {(["none", "sm", "md", "lg", "full"] as const).map((token) => (
              <div key={token} className="flex flex-col items-center gap-1">
                <div
                  className="size-12 border border-matu-border bg-matu-card"
                  style={{ borderRadius: `var(--radius-matu-${token})` }}
                />
                <span className="font-mono text-xs text-matu-muted-foreground">
                  radius-{token}
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {([1, 2, 3, 4, 5, 6, 8, 10, 12] as const).map((token) => (
              <div key={token} className="flex flex-col items-center gap-1">
                <div
                  className="bg-matu-primary/20 border border-matu-primary/40"
                  style={{
                    width: `var(--spacing-matu-${token})`,
                    height: `var(--spacing-matu-${token})`,
                  }}
                />
                <span className="font-mono text-xs text-matu-muted-foreground">
                  {token}
                </span>
              </div>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Cards earn their existence" description="Border-first, no shadow on cards, 8px radius. No cards inside cards.">
        <div className="grid gap-3 md:grid-cols-3">
          <BareCard>
            <p className="font-mono text-xs text-matu-muted-foreground">PO-2026-0042</p>
            <p className="text-base font-semibold text-matu-foreground">Hủ đựng canh</p>
            <p className="text-sm text-matu-muted-foreground">154 cây · 26.000 ₫</p>
          </BareCard>
          <BareCard>
            <p className="font-mono text-xs text-matu-muted-foreground">PO-2026-0043</p>
            <p className="text-base font-semibold text-matu-foreground">Ly nhựa 650</p>
            <p className="text-sm text-matu-muted-foreground">80 cây · 21.500 ₫</p>
          </BareCard>
          <BareCard>
            <p className="font-mono text-xs text-matu-muted-foreground">PO-2026-0044</p>
            <p className="text-base font-semibold text-matu-foreground">Khăn lạnh</p>
            <p className="text-sm text-matu-muted-foreground">37 bịch · 44.000 ₫</p>
          </BareCard>
        </div>
      </SectionCard>

      <SectionCard title="Toolbar" description="Filters trái + actions phải. Mobile stacks.">
        <ToolbarRow
          filters={
            <>
              <PillButton>
                <IconSearch className="size-4" />
                Tìm nguyên liệu
              </PillButton>
              <PillButton>Tất cả danh mục</PillButton>
              <PillButton>Tất cả trạng thái</PillButton>
            </>
          }
          actions={
            <PrimaryButton>
              <IconPlus className="size-4" />
              Tạo PO
            </PrimaryButton>
          }
        />
      </SectionCard>

      <SectionCard title="Empty state">
        <EmptyState
          icon={<IconShoppingCart />}
          title="Chưa có dữ liệu nhập kho"
          description="Bắt đầu bằng đơn đặt hàng đầu tiên hoặc nhận phiếu nhập từ NCC."
          action={
            <PrimaryButton>
              <IconPlus className="size-4" />
              Tạo PO đầu tiên
            </PrimaryButton>
          }
        />
      </SectionCard>

      <SectionCard title="Status badges" description="Semantic, không lạm dụng brand red.">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">
            <IconCheck className="size-3" />
            Hàng đạt chuẩn
          </Badge>
          <Badge tone="warning">
            <IconAlertTriangle className="size-3" />
            Cần kiểm tra giá
          </Badge>
          <Badge tone="destructive">
            <IconAlertTriangle className="size-3" />
            Có hàng hư
          </Badge>
          <Badge tone="info">
            <IconTruck className="size-3" />
            Đang giao
          </Badge>
          <Badge tone="muted">Đã hủy</Badge>
        </div>
      </SectionCard>
    </PageSurface>
  );
}

/* -------------------------------------------------------------------------- */
/*  Local primitives — kitchen-sink-only. Production code uses @comtammatu/ui */
/*  primitives composed via matu-surface adapters.                            */
/* -------------------------------------------------------------------------- */

function Swatch({
  label,
  className,
  textOnDark,
}: {
  label: string;
  className: string;
  textOnDark?: boolean;
}) {
  return (
    <div className={`flex h-20 flex-col justify-end rounded-matu-md p-2 ${className}`}>
      <span
        className={`font-mono text-xs ${textOnDark ? "text-matu-primary-foreground" : "text-matu-foreground"}`}
      >
        {label}
      </span>
    </div>
  );
}

function BareCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-matu-md border border-matu-border bg-matu-card p-4">
      {children}
    </div>
  );
}

function PrimaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-matu-md bg-matu-primary px-4 text-sm font-semibold text-matu-primary-foreground transition-colors hover:bg-matu-brand-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matu-ring focus-visible:ring-offset-2"
    >
      {children}
    </button>
  );
}

function PillButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="inline-flex h-10 items-center gap-2 rounded-matu-md border border-matu-border bg-matu-card px-3 text-sm font-medium text-matu-foreground transition-colors hover:border-matu-brand-brown/30 hover:bg-matu-muted"
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "success" | "warning" | "destructive" | "info" | "muted";
}) {
  const toneClass = {
    success: "bg-matu-success/15 text-matu-success border-matu-success/30",
    warning: "bg-matu-warning/15 text-matu-warning border-matu-warning/30",
    destructive:
      "bg-matu-destructive/15 text-matu-destructive border-matu-destructive/30",
    info: "bg-matu-info/15 text-matu-info border-matu-info/30",
    muted: "bg-matu-muted text-matu-muted-foreground border-matu-border",
  }[tone];
  return (
    <span
      className={`inline-flex h-7 items-center gap-1 rounded-matu-full border px-2.5 text-xs font-medium ${toneClass}`}
    >
      {children}
    </span>
  );
}
