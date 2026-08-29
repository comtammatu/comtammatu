"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import { messages } from "@lib/messages";
import { IssueDetailClient } from "./[id]/issue-detail-client";
import {
  loadIssueDocumentDialog,
  type IssueDetailData,
} from "./load-issue-document-dialog";

const issuesCopy = messages.inventory.issues;
const ISSUE_OVERLAY_KEYS = ["issueId", "mode"] as const;

export function IssueDocumentDialogHost({
  basePath = "/inventory/consumption",
}: {
  basePath?: string;
}) {
  const router = useRouter();
  const overlay = useDocumentOverlayUrl(ISSUE_OVERLAY_KEYS);
  const issueKey = overlay.get("issueId");
  const open = issueKey != null && issueKey.length > 0;
  const [detail, setDetail] = useState<IssueDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || issueKey == null) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setError(null);
    startTransition(async () => {
      const result = await loadIssueDocumentDialog(issueKey);
      if (cancelled) return;
      if (!result.success || !result.data) {
        setError(result.error ?? issuesCopy.reloadFailed);
        setDetail(null);
        return;
      }
      setDetail(result.data);
      setError(null);
    });
    return () => {
      cancelled = true;
    };
  }, [issueKey, open]);

  function closeOverlay() {
    const returnTo = getSafeInternalReturnTo(
      new URLSearchParams(window.location.search).get("returnTo"),
    );
    overlay.clearOverlay(["issueId", "mode"], "replace");
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
        title={issuesCopy.reloadFailed}
        footer={
          <Button type="button" onClick={closeOverlay}>
            {ACTIONS_VI.close}
          </Button>
        }
      >
        <AppEmptyState
          mode="error"
          title={issuesCopy.reloadFailed}
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
        title={issuesCopy.linesTab}
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
    <IssueDetailClient
      issueId={detail.issueId}
      tenantId={detail.tenantId}
      initialIssue={detail.initialIssue}
      initialLines={detail.initialLines}
      ingredients={detail.ingredients}
      canViewMonetary={detail.canViewMonetary}
      canAdjustStock={detail.canAdjustStock}
      auditLogs={detail.auditLogs}
      listBasePath={basePath}
      presentation="dialog"
      onCloseDialog={closeOverlay}
    />
  );
}
