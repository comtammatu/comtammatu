"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { MENU_VI } from "@comtammatu/shared/messages";
import { CategoryFormDialog } from "./category-form-dialog";

export function AddCategoryButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="mr-2 size-4" />
        {MENU_VI.addCategory}
      </Button>
      <CategoryFormDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
