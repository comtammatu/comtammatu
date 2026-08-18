"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCount } from "@comtammatu/shared/format";
import { formatVNDate } from "@comtammatu/shared/time";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Field, FieldLabel } from "@comtammatu/ui/components/field";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";
import { useFormControlSize } from "@/components/form/control-size";
import { ResponsiveActionButton } from "@/components/responsive-action-button";
import { messages } from "@lib/messages";
import {
  restoreMbbankStatementGap,
  type MbbankStatementRestoreState,
} from "./restore-actions";
import {
  MBBANK_STATEMENT_OPENING_EFFECTIVE_AT,
  MBBANK_STATEMENT_ROW_COUNT,
} from "./mbbank-statement-restore-contract";

const copy = messages.finance.bankTransactions;
const initialState: MbbankStatementRestoreState = { status: "idle" };

export function MbbankStatementRestoreDialog() {
  const controlSize = useFormControlSize();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(
    restoreMbbankStatementGap,
    initialState,
  );

  useEffect(() => {
    if (state.status === "success") {
      toast.success(
        copy.statementRestoreSuccess(state.insertedCount, state.existingCount),
      );
      setConfirmed(false);
      setOpen(false);
      router.refresh();
    }
  }, [router, state]);

  return (
    <>
      <ResponsiveActionButton
        variant="outline"
        density="header"
        onClick={() => setOpen(true)}
      >
        {copy.statementRestoreAction}
      </ResponsiveActionButton>
      <AppDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setConfirmed(false);
        }}
        title={copy.statementRestoreTitle}
        description={copy.statementRestoreDescription(
          formatCount(MBBANK_STATEMENT_ROW_COUNT),
          formatVNDate(MBBANK_STATEMENT_OPENING_EFFECTIVE_AT),
        )}
        footer={
          <Button
            type="submit"
            form="mbbank-statement-restore-form"
            size={controlSize === "touch" ? "touch" : "default"}
            disabled={pending || !confirmed}
          >
            {pending ? copy.statementRestorePending : copy.statementRestoreSubmit}
          </Button>
        }
      >
        <form
          id="mbbank-statement-restore-form"
          action={action}
          className="grid gap-4"
        >
          {state.status === "error" ? (
            <Alert variant="destructive">
              <AlertDescription>
                <p>{state.message}</p>
              </AlertDescription>
            </Alert>
          ) : null}
          <input
            type="hidden"
            name="confirmed"
            value={confirmed ? "true" : "false"}
          />
          <Field>
            <div className="flex items-start gap-3">
              <Checkbox
                id="mbbank-statement-restore-confirmed"
                size={controlSize === "touch" ? "touch" : "default"}
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
                disabled={pending}
              />
              <FieldLabel
                htmlFor="mbbank-statement-restore-confirmed"
                className="font-normal leading-snug"
              >
                {copy.statementRestoreConfirm}
              </FieldLabel>
            </div>
          </Field>
        </form>
      </AppDialog>
    </>
  );
}
