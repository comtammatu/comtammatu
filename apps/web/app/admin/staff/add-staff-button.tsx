"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { StaffFormDialog } from "./staff-form-dialog";
import type { BranchOption } from "./staff-table";

interface AddStaffButtonProps {
  branches: BranchOption[];
}

export function AddStaffButton({ branches }: AddStaffButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="mr-2 size-4" />
        Thêm nhân viên
      </Button>
      <StaffFormDialog
        open={open}
        onOpenChange={setOpen}
        branches={branches}
      />
    </>
  );
}
