"use client";

import { useActionState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
        status: "Đang kiểm tra",
        description: "Hệ thống đang xác thực tài khoản của bạn.",
        statusClassName:
          "border-info/20 bg-info/10 text-info shadow-sm shadow-info/10",
      }
    : state?.error
      ? {
        status: "Cần xem lại",
        description: state.error,
        statusClassName:
          "border-warning/20 bg-warning/10 text-warning shadow-sm shadow-warning/10",
      }
      : {
        status: "Sẵn sàng",
        description: "Nhập email và mật khẩu để bắt đầu.",
        statusClassName:
          "border-border/70 bg-muted/50 text-muted-foreground shadow-sm",
      };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest",
            statusState.statusClassName,
          )}
        >
          {statusState.status}
        </Badge>
        <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Vào đúng phân hệ theo vai trò
        </span>
      </div>

      <form action={formAction} className="space-y-4" aria-busy={isPending}>
        {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
        <div className="space-y-2">
          <p className="text-sm leading-6 text-muted-foreground">
            {statusState.description}
          </p>
        </div>

        <div className="grid gap-3">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">
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
              className="min-h-11 min-w-11 h-12 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-sm font-medium">
              Mật khẩu
            </Label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="min-h-11 min-w-11 h-12 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>
        </div>

        {state?.error ? (
          <div
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm leading-5 text-destructive"
            role="alert"
          >
            <p className="font-semibold">Không thể đăng nhập</p>
            <p className="mt-1">{state.error}</p>
          </div>
        ) : null}

        <Button
          type="submit"
          className="min-h-11 min-w-11 h-12 w-full rounded-lg text-sm font-semibold shadow-sm transition-shadow hover:shadow-md"
          disabled={isPending}
        >
          {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {isPending ? "Đang kiểm tra..." : "Đăng nhập"}
        </Button>

        <div className="rounded-lg border border-border/70 bg-muted/35 px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">
                Tài khoản đã được phân quyền sẵn
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                Sau khi đăng nhập, hệ thống sẽ đưa bạn vào đúng nơi làm việc.
              </p>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
