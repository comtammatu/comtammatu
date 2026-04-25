"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { ItemFormDialog } from "./item-form-dialog";
import type { CategoryRow } from "./category-table";

interface AddItemButtonProps {
  categories: CategoryRow[];
}

export function AddItemButton({ categories }: AddItemButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="mr-2 size-4" />
        Thêm món
      </Button>
      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
      />
    </>
  );
}
