"use client";

import { useState } from "react";
import { UserPlus as IconUserPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { StaffFormDialog } from "./staff-form-dialog";
import type { BranchOption, PositionOption } from "./staff-table";

import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
interface AddStaffButtonProps {
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

export function AddStaffButton({
  branches,
  positionOptions,
}: AddStaffButtonProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size={isTouchLayout ? "touch" : "default"} onClick={() => setOpen(true)}>
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
