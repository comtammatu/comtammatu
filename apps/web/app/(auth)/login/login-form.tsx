"use client";

import { type ChangeEvent, useActionState, useState } from "react";
import {
  CircleAlert as IconAlertCircle,
  LockKeyhole as IconLockKeyhole,
  Mail as IconMail,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { login } from "./actions";

interface LoginFormProps {
  returnTo?: string;
}

type LoginField = "email" | "password";

interface LoginValues {
  email: string;
  password: string;
}

const LOGIN_ERROR_ID = "login-form-error";
const EMAIL_ERROR_ID = "login-email-error";
const PASSWORD_ERROR_ID = "login-password-error";

export function LoginForm({ returnTo }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, null);
  const [values, setValues] = useState<LoginValues>({
    email: "",
    password: "",
  });
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<LoginValues | null>(null);

  const feedbackMatchesCurrentValues =
    !!lastSubmittedValues &&
    lastSubmittedValues.email === values.email &&
    lastSubmittedValues.password === values.password;
  const showFeedback = !isPending && feedbackMatchesCurrentValues;
  const actionError = showFeedback ? state?.error : undefined;
  const emailError = showFeedback ? state?.fieldErrors?.email : undefined;
  const passwordError = showFeedback ? state?.fieldErrors?.password : undefined;
  const emailInvalid = !!emailError || !!actionError;
  const passwordInvalid = !!passwordError || !!actionError;

  function updateValue(field: LoginField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
  }

  return (
    <form
      action={formAction}
      className="space-y-4"
      aria-busy={isPending}
      onSubmit={() => setLastSubmittedValues(values)}
    >
      {returnTo ? (
        <input type="hidden" name="returnTo" value={returnTo} />
      ) : null}

      {actionError ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertDescription id={LOGIN_ERROR_ID}>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={emailInvalid || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <InputGroup className="h-10">
            <InputGroupAddon>
              <IconMail aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              placeholder="email@comtammatu.com"
              value={values.email}
              onChange={updateValue("email")}
              aria-invalid={emailInvalid || undefined}
              aria-describedby={
                emailError
                  ? EMAIL_ERROR_ID
                  : actionError
                    ? LOGIN_ERROR_ID
                    : undefined
              }
            />
          </InputGroup>
          {emailError ? (
            <FieldError id={EMAIL_ERROR_ID}>{emailError}</FieldError>
          ) : null}
        </Field>

        <Field data-invalid={passwordInvalid || undefined}>
          <FieldLabel htmlFor="password">Mật khẩu</FieldLabel>
          <InputGroup className="h-10">
            <InputGroupAddon>
              <IconLockKeyhole aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={values.password}
              onChange={updateValue("password")}
              aria-invalid={passwordInvalid || undefined}
              aria-describedby={
                passwordError
                  ? PASSWORD_ERROR_ID
                  : actionError
                    ? LOGIN_ERROR_ID
                    : undefined
              }
            />
          </InputGroup>
          {passwordError ? (
            <FieldError id={PASSWORD_ERROR_ID}>{passwordError}</FieldError>
          ) : null}
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
