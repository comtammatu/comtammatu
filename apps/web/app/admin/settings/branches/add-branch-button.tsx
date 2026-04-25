"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { BranchFormDialog } from "./branch-form-dialog";

export function AddBranchButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="mr-2 size-4" />
        Thêm điểm vận hành
      </Button>
      <BranchFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
