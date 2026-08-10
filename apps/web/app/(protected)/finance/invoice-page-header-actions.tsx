"use client";

import { useState } from "react";
import { Receipt as IconReceipt } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { ManualIssueInvoiceDialog } from "./manual-issue-invoice-dialog";

interface InvoicePageHeaderActionsProps {
  canIssueInvoices: boolean;
  branches: { id: number; name: string }[];
  defaultBranchId?: number;
  issueLabel: string;
}

export function InvoicePageHeaderActions({
  canIssueInvoices,
  branches,
  defaultBranchId,
  issueLabel,
}: InvoicePageHeaderActionsProps) {
  const isTouchLayout = useIsMobile(1024);
  const [manualIssueOpen, setManualIssueOpen] = useState(false);

  if (!canIssueInvoices) return null;

  return (
    <>
      <Button
        variant="outline"
        size={isTouchLayout ? "touch" : "default"}
        onClick={() => setManualIssueOpen(true)}
      >
        <IconReceipt className="size-4" />
        {issueLabel}
      </Button>
      <ManualIssueInvoiceDialog
        open={manualIssueOpen}
        onOpenChange={setManualIssueOpen}
        branches={branches}
        defaultBranchId={defaultBranchId}
        onIssued={() => setTimeout(() => window.location.reload(), 1200)}
      />
    </>
  );
}
