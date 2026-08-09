"use client";

import { type ChangeEvent, useActionState, useState, useTransition } from "react";
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
import { ACTIONS_VI, AUTH_VI } from "@comtammatu/shared/messages";
import { useFormControlSize } from "@/components/form/control-size";
import { MfaChallengeForm } from "@lib/auth/mfa-challenge-form";
import { messages } from "@lib/messages";
import { completeLoginAfterMfa, login } from "./actions";

type LoginField = "email" | "password";

interface LoginValues {
  email: string;
  password: string;
}

const LOGIN_ERROR_ID = "login-form-error";
const EMAIL_ERROR_ID = "login-email-error";
const PASSWORD_ERROR_ID = "login-password-error";
const mfaCopy = messages.auth.mfa;

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(login, null);
  const controlSize = useFormControlSize();
  const [values, setValues] = useState<LoginValues>({
    email: "",
    password: "",
  });
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<LoginValues | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isFinishingMfa, startFinishMfa] = useTransition();

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
  const mfaRequired = Boolean(state?.mfaRequired && state.factorId);
  const factorId = state?.factorId ?? null;

  function updateValue(field: LoginField) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setValues((current) => ({
        ...current,
        [field]: event.target.value,
      }));
    };
  }

  if (mfaRequired && factorId) {
    return (
      <div className="flex flex-col gap-4" aria-busy={isFinishingMfa}>
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">{mfaCopy.loginChallengeTitle}</h2>
          <p className="text-sm text-muted-foreground">
            {mfaCopy.loginChallengeDescription}
          </p>
        </div>

        {mfaError ? (
          <Alert variant="destructive">
            <IconAlertCircle />
            <AlertDescription>{mfaError}</AlertDescription>
          </Alert>
        ) : null}

        <MfaChallengeForm
          factorId={factorId}
          description={mfaCopy.challengeDescription}
          submitLabel={ACTIONS_VI.signIn}
          onVerified={() => {
            startFinishMfa(async () => {
              setMfaError(null);
              const result = await completeLoginAfterMfa();
              if (result?.error) {
                setMfaError(result.error);
              }
            });
          }}
        />
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      aria-busy={isPending}
      onSubmit={() => setLastSubmittedValues(values)}
    >
      {actionError ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertDescription id={LOGIN_ERROR_ID}>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={emailInvalid || undefined}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <InputGroup size={controlSize}>
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
          <FieldLabel htmlFor="password">{AUTH_VI.passwordLabel}</FieldLabel>
          <InputGroup size={controlSize}>
            <InputGroupAddon>
              <IconLockKeyhole aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder={AUTH_VI.passwordPlaceholder}
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

      <Button
        type="submit"
        size="touch"
        className="w-full"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Spinner className="motion-reduce:animate-none" />
            {AUTH_VI.checking}
          </>
        ) : (
          ACTIONS_VI.signIn
        )}
      </Button>
    </form>
  );
}
