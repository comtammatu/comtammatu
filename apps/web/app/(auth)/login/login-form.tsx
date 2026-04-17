"use client";

import { useActionState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { cn } from "@comtammatu/ui";
import { login } from "./actions";

interface LoginFormProps {
  returnTo?: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, null);

  const statusState = isPending
    ? {
        status: "Đang xác thực",
        description: "Hệ thống đang kiểm tra tài khoản và quyền truy cập của bạn.",
        className:
          "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-100",
      }
    : state?.error
      ? {
          status: "Cần xem lại",
          description: state.error,
          className:
            "border-amber-200 bg-amber-50 text-amber-800 dark:border-warning/30 dark:bg-warning/15 dark:text-amber-100",
        }
      : {
          status: "Sẵn sàng",
          description: "Nhập thông tin để hệ thống đưa bạn vào đúng không gian làm việc.",
          className:
            "border-border bg-secondary/70 text-secondary-foreground dark:bg-secondary dark:text-secondary-foreground",
        };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest",
            statusState.className,
          )}
        >
          {statusState.status}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
          <ArrowRight className="size-3.5 text-primary" />
          Điều hướng theo vai trò
        </span>
      </div>

      <form action={formAction} className="space-y-5" aria-busy={isPending}>
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

        <p className="text-sm leading-6 text-muted-foreground">
          {statusState.description}
        </p>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-semibold">
              Email
            </Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="email@comtammatu.com"
              className="h-12 rounded-2xl border-border bg-background/85 text-sm shadow-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-semibold">
              Mật khẩu
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="h-12 rounded-2xl border-border bg-background/85 text-sm shadow-sm"
            />
          </div>
        </div>

        {state?.error ? (
          <div
            className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
            role="alert"
          >
            <p className="font-semibold">Không thể đăng nhập</p>
            <p>{state.error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-full text-sm font-semibold"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Spinner className="motion-reduce:animate-none" />
              Đang kiểm tra...
            </>
          ) : (
            <>
              Đăng nhập
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>

        <div className="rounded-2xl border bg-muted/50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Tài khoản đã được phân quyền sẵn
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Sau khi đăng nhập, hệ thống sẽ đưa bạn vào đúng nơi làm việc mà
                không cần chọn lại bối cảnh thủ công.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
