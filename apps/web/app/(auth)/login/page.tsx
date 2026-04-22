import { UtensilsCrossed } from "lucide-react";
import { LoginForm } from "./login-form";

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
        <div className="flex size-14 items-center justify-center rounded-xl bg-primary/15 text-primary lg:size-16 lg:bg-primary-foreground/20 lg:text-primary-foreground lg:rounded-2xl">
          <UtensilsCrossed className="size-6 lg:size-7" />
        </div>
        <h1 className="font-heading text-lg font-semibold lg:text-2xl lg:text-primary-foreground">
          Cơm Tấm Má Tư
        </h1>
      </div>

      {/* Login form */}
      <section className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-sm space-y-6">
          <h2 className="font-heading text-xl font-semibold">Đăng nhập</h2>
          <LoginForm returnTo={sp.returnTo} />
        </div>
      </section>
    </main>
  );
}
