"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Label } from "@comtammatu/ui/components/label";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppDialog } from "@/components/form";
import { messages } from "@lib/messages";
import {
  importSepayBankTransactions,
  type SepayImportState,
} from "./import-actions";

const copy = messages.finance.bankTransactions;
const initialState: SepayImportState = { status: "idle" };

export function SepayImportDialog() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    importSepayBankTransactions,
    initialState,
  );

  useEffect(() => {
    if (state.status === "error") {
      toast.error(state.message);
      return;
    }
    if (state.status === "success") {
      toast.success(
        copy.importSuccess(state.insertedCount, state.existingCount),
      );
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
    }
  }, [router, state]);

  return (
    <>
      <Button variant="outline" size="touch" onClick={() => setOpen(true)}>
        {copy.importAction}
      </Button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={copy.importTitle}
        description={copy.importDescription}
        footer={
          <Button
            type="submit"
            form="sepay-export-import-form"
             size="touch"
            disabled={pending}
          >
            {pending ? copy.importPending : copy.importSubmit}
          </Button>
        }
      >
        <form
          id="sepay-export-import-form"
          ref={formRef}
          action={action}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="sepay-export-file">{copy.importFileLabel}</Label>
            <InputGroup size="touch">
              <InputGroupInput
                id="sepay-export-file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
                disabled={pending}
              />
            </InputGroup>
            <p className="text-xs text-muted-foreground">{copy.importHint}</p>
          </div>
        </form>
      </AppDialog>
    </>
  );
}
