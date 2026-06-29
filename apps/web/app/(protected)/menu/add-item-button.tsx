"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { MENU_VI } from "@comtammatu/shared/messages";
import { ItemFormDialog } from "./item-form-dialog";
import type { CategoryRow } from "./category-table";

interface AddItemButtonProps {
  categories: CategoryRow[];
  tenantId: number;
}

export function AddItemButton({ categories, tenantId }: AddItemButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus className="mr-2 size-4" />
        {MENU_VI.addItem}
      </Button>
      <ItemFormDialog
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        tenantId={tenantId}
      />
    </>
  );
}
