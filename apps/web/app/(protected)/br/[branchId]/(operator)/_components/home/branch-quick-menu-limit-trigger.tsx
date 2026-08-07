/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: branch home uses vietnamese */
"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { BranchQuickMenuLimitSheet } from "./branch-quick-menu-limit-sheet";

export function BranchQuickMenuLimitTrigger({
  branchId,
  variant = "outline",
}: {
  branchId: number;
  variant?: "outline" | "default" | "secondary" | "ghost" | "destructive";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size="touch"
        onClick={() => setOpen(true)}
        className="w-full sm:w-auto font-medium"
      >
        <ShieldAlert data-icon="inline-start" className="size-4 text-warning" />
        Tạm ngưng bán món
      </Button>
      <BranchQuickMenuLimitSheet
        branchId={branchId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
