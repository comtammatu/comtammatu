import { BRAND_NAME, BrandLockup, BrandMascot } from "@/components/brand";
import { LoginForm } from "./login-form";
import { AppSection } from "@/components/surface";
import { Frame } from "@comtammatu/ui/components/frame";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export default function LoginPage() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex min-h-dvh flex-col pt-[env(safe-area-inset-top)] bg-gradient-to-br from-secondary/30 via-background to-primary/10 sm:landscape:grid sm:landscape:grid-cols-2 md:grid md:grid-cols-2"
    >
      <div className="brand-pattern-caro absolute inset-0 opacity-10 pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center p-4 sm:landscape:min-h-dvh sm:landscape:grid sm:landscape:grid-rows-2 md:min-h-dvh md:grid md:grid-rows-2">
        <div className="flex flex-1 items-center justify-center">
          <Frame className="theme-light-only border-border/20 bg-card/90 p-2 shadow-effect-card-resting md:p-3 lg:p-4">
            <BrandLockup decorative size="md" priority className="md:h-24 lg:h-28" />
          </Frame>
        </div>
        <h1 className="font-heading sr-only">{BRAND_NAME}</h1>
        <div className="hidden h-40 w-40 items-center justify-center sm:landscape:flex sm:landscape:justify-self-center md:flex md:justify-self-center">
          <BrandMascot
            animated
            decorative
            mood="waving"
            className="shrink-0 scale-75 drop-shadow-lg"
          />
        </div>
      </div>

      <section className="relative z-10 flex flex-1 items-center justify-center p-4 sm:landscape:min-h-dvh md:min-h-dvh">
        <div className="w-full max-w-sm">
          <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center sm:landscape:hidden md:hidden">
            <BrandMascot
              animated
              decorative
              mood="waving"
              className="shrink-0 scale-50 drop-shadow-lg"
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
