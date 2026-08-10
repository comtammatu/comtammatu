"use client";

import { useState } from "react";
import { UserPlus as IconUserPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { StaffFormDialog } from "./staff-form-dialog";
import type { BranchOption, PositionOption } from "./staff-table";

interface AddStaffButtonProps {
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

export function AddStaffButton({
  branches,
  positionOptions,
}: AddStaffButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="touch" onClick={() => setOpen(true)}>
        <IconUserPlus data-icon="inline-start" />
        {messages.controlSurface.staffPage.createAccount}
      </Button>
      <StaffFormDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
        positionOptions={positionOptions}
      />
    </>
  );
}
