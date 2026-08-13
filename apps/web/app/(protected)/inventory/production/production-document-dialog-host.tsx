"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  ACTIONS_VI,
  INVENTORY_VI,
  STATES_VI,
} from "@comtammatu/shared/messages";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { messages } from "@lib/messages";
import { ProductionDetailClient } from "./[id]/production-detail-client";
import { loadProductionDocumentDialog } from "../load-production-document-dialog";
import type { ProductionRunRow } from "../production-run-actions";

const productionCopy = messages.inventory.operatorFlow;
export const PRODUCTION_OVERLAY_KEYS = ["runId", "mode"] as const;

export function ProductionDocumentDialogHost() {
  const router = useRouter();
  const overlay = useDocumentOverlayUrl(PRODUCTION_OVERLAY_KEYS);
  const runKey = overlay.get("runId");
  const open = runKey != null && runKey.length > 0;
  const [detail, setDetail] = useState<ProductionRunRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || runKey == null) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError(null);
    startTransition(async () => {
      const result = await loadProductionDocumentDialog(runKey);
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? productionCopy.productionRunLoadFailed);
        setDetail(null);
        return;
      }
      setDetail(result.data);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [runKey, open]);

  function closeOverlay() {
    const returnTo = getSafeInternalReturnTo(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    overlay.clearOverlay(["runId", "mode"], "replace");
    if (returnTo) {
      router.push(returnTo, { scroll: false });
    }
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
        title={productionCopy.productionRunLoadFailed}
        footer={
          <Button type="button" onClick={closeOverlay}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <AppEmptyState
          mode="error"
          title={productionCopy.productionRunLoadFailed}
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
        title={INVENTORY_VI.productionOrdersTab}
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
    <ProductionDetailClient
      run={detail}
      presentation="dialog"
      onClose={closeOverlay}
      onRunReloaded={setDetail}
    />
  );
}
