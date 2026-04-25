"use client";

import { useActionState } from "react";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Input } from "@comtammatu/ui/components/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { login } from "./actions";

interface LoginFormProps {
  returnTo?: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <form action={formAction} className="space-y-4" aria-busy={isPending}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      {state?.error ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            spellCheck={false}
            placeholder="email@comtammatu.com"
            disabled={isPending}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={isPending}
          />
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Spinner className="motion-reduce:animate-none" />
            Đang kiểm tra...
          </>
        ) : (
          "Đăng nhập"
        )}
      </Button>
    </form>
  );
}
