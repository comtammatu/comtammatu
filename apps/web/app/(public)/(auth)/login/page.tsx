import { BRAND_NAME, BrandLockup } from "@/components/brand";
import { LoginForm } from "./login-form";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const sp = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col lg:grid lg:grid-cols-2">
      {/* Brand — compact on mobile, full-height panel on desktop */}
      <div className="flex flex-col items-center gap-3 px-6 pt-10 pb-4 lg:justify-center lg:bg-primary lg:p-12">
        <div className="rounded-lg border bg-background/95 p-3 shadow-sm lg:bg-primary-foreground">
          <BrandLockup decorative size="md" priority className="lg:h-28" />
        </div>
        <h1 className="font-heading sr-only">{BRAND_NAME}</h1>
      </div>

      {/* Login form */}
      <section className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <h2 className="font-heading text-xl font-semibold">
            {ACTIONS_VI.signIn}
          </h2>
          <LoginForm returnTo={sp.returnTo} />
        </div>
      </section>
    </main>
  );
}
