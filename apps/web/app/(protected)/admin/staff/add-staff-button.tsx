"use client";

import { useState } from "react";
import { UserPlus as IconUserPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
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
      <Button onClick={() => setOpen(true)}>
        <IconUserPlus className="mr-2 size-4" />
        Thêm nhân viên
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
