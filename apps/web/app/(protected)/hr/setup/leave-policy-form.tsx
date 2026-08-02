"use client";

import { useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "@/components/form/formatted-number-input";
import { messages } from "@lib/messages";
import {
  hrLeavePolicySchema,
  type HrLeavePolicy,
} from "@lib/hr/leave-policy-model";
import { saveHrLeavePolicy } from "./leave-policy-actions";

type HrLeavePolicyValues = Record<keyof HrLeavePolicy, string>;

function toFormValues(policy: HrLeavePolicy): HrLeavePolicyValues {
  return {
    standardWorkdays: String(policy.standardWorkdays),
    monthlyLeaveDays: String(policy.monthlyLeaveDays),
  };
}

export function LeavePolicyForm({
  policy,
  initiallyPersisted,
}: {
  policy: HrLeavePolicy;
  initiallyPersisted: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [values, setValues] = useState(() => toFormValues(policy));
  const [isPersisted, setIsPersisted] = useState(initiallyPersisted);
  const copy = messages.hr.client.leavePolicy;

  function updateValue(key: keyof HrLeavePolicy, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = hrLeavePolicySchema.safeParse(values);
    if (!parsed.success) {
      toast.error(copy.invalid);
      return;
    }

    startTransition(async () => {
      const result = await saveHrLeavePolicy(parsed.data);
      if (!result.success) {
        toast.error(result.error ?? copy.saveFailed);
        return;
      }
      setValues(toFormValues(parsed.data));
      setIsPersisted(true);
      toast.success(copy.saved);
    });
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="hr-standard-workdays">
            {copy.standardWorkdaysLabel}
          </FieldLabel>
          <FormattedNumberInput
            id="hr-standard-workdays"
            value={values.standardWorkdays}
            onValueChange={(value) => updateValue("standardWorkdays", value)}
            maxFractionDigits={1}
            aria-required="true"
          />
          <FieldDescription>
            {copy.standardWorkdaysDescription}
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="hr-monthly-leave-days">
            {copy.monthlyLeaveDaysLabel}
          </FieldLabel>
          <FormattedNumberInput
            id="hr-monthly-leave-days"
            value={values.monthlyLeaveDays}
            onValueChange={(value) => updateValue("monthlyLeaveDays", value)}
            maxFractionDigits={1}
            aria-required="true"
          />
          <FieldDescription>
            {copy.monthlyLeaveDaysDescription}
          </FieldDescription>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={isPersisted ? "success" : "warning"}>
          {isPersisted ? copy.persisted : copy.usingDefaults}
        </Badge>
        <p className="text-sm text-muted-foreground">{copy.allocationHint}</p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Spinner className="mr-2" /> : null}
          {copy.save}
        </Button>
      </div>
    </form>
  );
}
