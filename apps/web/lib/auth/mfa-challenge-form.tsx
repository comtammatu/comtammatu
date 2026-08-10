"use client";

import { type FormEvent, useState, useTransition } from "react";
import { CircleAlert as IconAlertCircle } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { challengeAndVerifyTotp } from "@lib/auth/mfa";
import { messages } from "@lib/messages";

const copy = messages.auth.mfa;

type MfaChallengeFormProps = {
  factorId: string;
  onVerified: () => void | Promise<void>;
  submitLabel?: string;
  description?: string;
};

export function MfaChallengeForm({
  factorId,
  onVerified,
  submitLabel = copy.verifySubmit,
  description = copy.challengeDescription,
}: MfaChallengeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError(copy.codeInvalid);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await challengeAndVerifyTotp(factorId, trimmed);
      if (!result.success) {
        setError(result.error);
        return;
      }
      await onVerified();
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      {description ? (
        <p className="text-sm text-muted-foreground">{description}</p>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <IconAlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor="mfa-totp-code">{copy.codeLabel}</FieldLabel>
          <Input
            id="mfa-totp-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            placeholder={copy.codePlaceholder}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            disabled={isPending}
            required
          />
        </Field>
      </FieldGroup>

      <Button type="submit" size="touch" disabled={isPending || code.length < 6}>
        {isPending ? (
          <>
            <Spinner className="motion-reduce:animate-none" />
            {copy.verifying}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  );
}
