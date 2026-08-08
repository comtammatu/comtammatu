"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";
import { BranchQuickMenuLimitSheet } from "./branch-quick-menu-limit-sheet";

export function BranchQuickMenuLimitTrigger({
  branchId,
  variant = "outline",
  className,
}: {
  branchId: number;
  variant?: "outline" | "default" | "secondary" | "ghost" | "destructive";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size="touch"
        onClick={() => setOpen(true)}
        className={
          className ?? "w-full sm:w-auto font-medium"
        }
      >
        <ShieldAlert data-icon="inline-start" className="size-4 text-warning" />
        {messages.settings.branch.menuLimitsTitle}
      </Button>
      <BranchQuickMenuLimitSheet
        branchId={branchId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
