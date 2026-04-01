"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { login } from "./actions";

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          spellCheck={false}
          placeholder="email@comtammatu.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mật khẩu</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
        {isPending ? "Đang đăng nhập…" : "Đăng nhập"}
      </Button>
    </form>
  );
}
