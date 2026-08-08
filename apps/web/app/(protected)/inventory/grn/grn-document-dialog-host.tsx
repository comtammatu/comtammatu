"use client";

import { useEffect, useState, useTransition } from "react";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import type { GrnDetailData } from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";
import { GRNDetailClient } from "./[id]/grn-detail-client";
import { loadGrnDocumentDialog } from "./load-grn-document-dialog";

const grnCopy = messages.inventory.grn;
const GRN_OVERLAY_KEYS = ["grnId", "mode"] as const;

export function GrnDocumentDialogHost({
  basePath = "/inventory/grn",
}: {
  basePath?: string;
}) {
  const overlay = useDocumentOverlayUrl(GRN_OVERLAY_KEYS);
  const grnKey = overlay.get("grnId");
  const open = grnKey != null && grnKey.length > 0;
  const [detail, setDetail] = useState<GrnDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || grnKey == null) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError(null);
    startTransition(async () => {
      const result = await loadGrnDocumentDialog(grnKey);
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? grnCopy.notFound);
        setDetail(null);
        return;
      }
      setDetail(result.data);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [grnKey, open]);

  function closeOverlay() {
    overlay.clearOverlay(["grnId", "mode"], "replace");
  }

  if (!open) return null;

  if (error != null) {
    return (
      <AppDialog
        variant="document"
        open
        onOpenChange={(next) => {
          if (!next) closeOverlay();
        }}
        title={grnCopy.detailLoadFailed}
        footer={
          <Button type="button" onClick={closeOverlay}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <AppEmptyState
          mode="error"
          title={grnCopy.detailLoadFailed}
          description={error}
        />
      </AppDialog>
    );
  }

  if (detail == null || isPending) {
    return (
      <AppDialog
        variant="document"
        open
        onOpenChange={(next) => {
          if (!next) closeOverlay();
        }}
        title={grnCopy.listTitle}
        footer={
          <Button type="button" variant="outline" onClick={closeOverlay}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          {STATES_VI.loading}
        </div>
      </AppDialog>
    );
  }

  return (
    <GRNDetailClient
      grn={detail.grn}
      ingredients={detail.ingredients}
      canAdjustStock={detail.canAdjustStock}
      canAmendConfirmed={detail.canAmendConfirmed}
      canEditDraft={detail.canEditDraft}
      canConfirm={detail.canConfirm}
      canManageSupplierInvoice={detail.canManageSupplierInvoice}
      receivingLocationOptions={detail.receivingLocationOptions}
      auditLogs={detail.auditLogs}
      grnListBasePath={basePath}
      presentation="dialog"
    />
  );
}
