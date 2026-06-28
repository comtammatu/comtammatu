"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { BranchFormDialog } from "./branch-form-dialog";

export function AddBranchButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus data-icon="inline-start" />
        {messages.settings.branchForm.addButton}
      </Button>
      <BranchFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
