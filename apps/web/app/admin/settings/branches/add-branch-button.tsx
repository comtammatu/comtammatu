"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { BranchFormDialog } from "./branch-form-dialog";

interface AddBranchButtonProps {
  branchKindSchemaAvailable: boolean;
}

export function AddBranchButton({
  branchKindSchemaAvailable,
}: AddBranchButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" />
        Thêm điểm vận hành
      </Button>
      <BranchFormDialog
        open={open}
        onOpenChange={setOpen}
        branchKindSchemaAvailable={branchKindSchemaAvailable}
      />
    </>
  );
}
