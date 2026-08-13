"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BranchQuickMenuLimitSheet } from "../_components/home/branch-quick-menu-limit-sheet";

export function BranchMenuLimitsHost({ branchId }: { branchId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  return (
    <BranchQuickMenuLimitSheet
      branchId={branchId}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) router.push(`/br/${branchId}`);
      }}
    />
  );
}
