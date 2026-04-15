"use client";

import { useActionState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { login } from "../../(auth)/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BetaLoginForm({ returnTo }: { returnTo?: string }) {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <form action={formAction} className="space-y-5" aria-busy={isPending}>
      <input type="hidden" name="surface" value="beta" />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="beta-email">Email</Label>
          <Input
            id="beta-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="email@comtammatu.com"
            required
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="beta-password">Mật khẩu</Label>
          <Input
            id="beta-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-10"
          />
        </div>
      </div>

      {state?.error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <p className="font-semibold">Không thể đăng nhập</p>
          <p>{state.error}</p>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
        {isPending ? "Đang kiểm tra" : "Vào beta"}
      </Button>

      <Card>
        <CardContent className="pt-4 text-sm text-muted-foreground">
          Beta chỉ thay lớp trình bày. Quyền truy cập, session, dữ liệu và redirect sau đăng nhập
          vẫn dùng cùng logic hiện tại.
        </CardContent>
      </Card>
    </form>
  );
}
