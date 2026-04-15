"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { login } from "../../(auth)/login/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BetaLoginForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="surface" value="beta" />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="rounded-full bg-primary/10 px-3 py-1 text-primary">
          {isPending ? "Đang xác thực" : "Đăng nhập beta"}
        </Badge>
        <Badge variant="outline" className="rounded-full px-3 py-1">
          Giữ nguyên ACL và dữ liệu thật
        </Badge>
      </div>

      <div className="grid gap-4">
        <div className="space-y-2">
          <label htmlFor="beta-email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id="beta-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="email@comtammatu.com"
            required
            className="h-12 rounded-2xl bg-background/70 px-4"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="beta-password" className="text-sm font-medium text-foreground">
            Mật khẩu
          </label>
          <Input
            id="beta-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-12 rounded-2xl bg-background/70 px-4"
          />
        </div>
      </div>

      {state?.error ? (
        <div
          className="rounded-3xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm leading-6 text-destructive"
          role="alert"
        >
          <p className="font-semibold">Không thể đăng nhập</p>
          <p>{state.error}</p>
        </div>
      ) : null}

      <Button type="submit" className="h-12 w-full rounded-2xl text-sm font-semibold" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {isPending ? "Đang kiểm tra" : "Vào beta"}
      </Button>

      <div className="rounded-3xl border border-border/60 bg-muted/35 p-4 text-sm leading-6 text-muted-foreground">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <p className="font-medium text-foreground">Surface mới, contract cũ</p>
            <p>
              Beta giữ nguyên quyền, session, và dữ liệu hiện có. Bạn sẽ được đưa vào đúng khu vực beta phù hợp với vai trò của mình.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
