"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { BranchFormDialog } from "./branch-form-dialog";

export function AddBranchButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus data-icon="inline-start" />
        {ACTIONS_VI.add} điểm vận hành
      </Button>
      <BranchFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
