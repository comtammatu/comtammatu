import { BRAND_NAME, BrandLockup, BrandMascot } from "@/components/brand";
import { LoginForm } from "./login-form";
import { AppSection } from "@/components/surface";
import { Frame } from "@comtammatu/ui/components/frame";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-col bg-gradient-to-br from-secondary/30 via-background to-primary/10 lg:grid lg:grid-cols-2">
      {/* Caro Pattern overlay */}
      <div className="brand-pattern-caro absolute inset-0 opacity-10 pointer-events-none" />

      {/* Brand — compact on mobile, full-height panel on desktop */}
      <div className="relative z-10 flex flex-col items-center gap-3 p-4 lg:justify-between lg:bg-primary/10">
        <span aria-hidden="true" className="hidden lg:block" />
        <div className="flex flex-col items-center gap-6 lg:flex-1 lg:justify-center">
          <Frame className="border-border/20 bg-card/90 p-3 shadow-effect-card-resting">
            <BrandLockup decorative size="md" priority className="lg:h-28" />
          </Frame>
          <div className="flex flex-col items-center text-center gap-2">
            {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: brand tagline static text */}
            <p className="font-heading text-lg font-bold tracking-tight text-foreground lg:text-xl">
              Hệ thống Vận hành & Bán hàng
            </p>
            {/* eslint-disable-next-line i18n/no-inline-vietnamese -- vi-allow: brand subtitle static text */}
            <p className="text-xs text-muted-foreground max-w-xs">
              Đồng bộ dữ liệu thời gian thực giữa Bếp, POS, Kho và Tài chính.
            </p>
          </div>
          <h1 className="font-heading sr-only">{BRAND_NAME}</h1>
        </div>
        <div className="hidden lg:flex flex-col items-center justify-center h-32 w-32">
          <BrandMascot mood="waving" animated className="shrink-0 scale-50" />
        </div>
      </div>

      {/* Login form */}
      <section className="relative z-10 flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center justify-center h-20 w-20 mb-4 lg:hidden">
            <BrandMascot
              mood="waving"
              animated
              className="shrink-0 scale-[0.35]"
            />
          </div>
          <AppSection
            title={ACTIONS_VI.signIn}
            description="Nhập tài khoản nhân viên được cấp để tiếp tục."
            className="bg-card/50 shadow-effect-card-resting backdrop-blur-md transition-[background-color,border-color] border-border/20 hover:border-border/30"
          >
            <LoginForm />
          </AppSection>
        </div>
      </section>
    </main>
  );
}
