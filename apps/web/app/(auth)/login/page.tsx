import { UtensilsCrossed } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { LoginForm } from "./login-form";

function BrandPanel() {
  return (
    <div className="hidden lg:flex relative flex-col items-center justify-center overflow-hidden bg-primary p-12 text-primary-foreground">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 -left-24 size-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-32 size-[28rem] rounded-full bg-white/5" />
        <div className="absolute top-1/3 right-12 size-48 rounded-full bg-white/[0.03]" />
      </div>

      {/* Dot pattern overlay */}
      <svg
        className="pointer-events-none absolute inset-0 size-full opacity-[0.04]"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="dot-grid"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="2" cy="2" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>

      {/* Content */}
      <div className="relative z-10 flex max-w-md flex-col items-center text-center">
        {/* Rice bowl icon */}
        <svg
          className="mb-8 size-28 text-primary-foreground/80"
          viewBox="0 0 120 120"
          fill="none"
          aria-hidden="true"
        >
          {/* Bowl */}
          <path
            d="M20 60 C20 60 20 95 60 95 C100 95 100 60 100 60Z"
            fill="currentColor"
            fillOpacity="0.15"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Bowl rim */}
          <path
            d="M15 60 H105"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          {/* Steam lines */}
          <path
            d="M42 48 C42 42 48 42 48 36"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M58 44 C58 38 64 38 64 32"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M74 48 C74 42 80 42 80 36"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.6"
          />
          {/* Chopsticks */}
          <path
            d="M85 25 L55 70"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M92 28 L62 73"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>

        <h2 className="mb-3 text-3xl font-bold tracking-tight">
          Cơm Tấm Má Tư
        </h2>
        <p className="text-lg font-light leading-relaxed text-primary-foreground/80">
          Hệ thống quản lý nhà hàng thông minh
        </p>

        <div className="mt-12 flex items-center gap-8 text-sm font-medium text-primary-foreground/60">
          <span>Quản lý</span>
          <span className="size-1 rounded-full bg-primary-foreground/40" />
          <span>Đơn giản</span>
          <span className="size-1 rounded-full bg-primary-foreground/40" />
          <span>Hiệu quả</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />

      {/* Form panel */}
      <div className="flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center space-y-2 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-primary">
              <UtensilsCrossed className="size-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Đăng nhập</h1>
            <p className="text-sm text-muted-foreground">
              Nhập thông tin để truy cập hệ thống
            </p>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Tài khoản</CardTitle>
              <CardDescription>
                Sử dụng email và mật khẩu được cấp
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LoginForm />
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            &copy; 2026 Cơm Tấm Má Tư CTCP
          </p>
        </div>
      </div>
    </div>
  );
}
