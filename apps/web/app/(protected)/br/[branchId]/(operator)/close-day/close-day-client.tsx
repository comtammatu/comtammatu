"use client";

import { useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { Badge } from "@comtammatu/ui/components/badge";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  Item,
  ItemContent,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  BranchOperatorPanel,
  BranchOperatorStatusStrip,
} from "@lib/branch-operator/components/branch-operator-page";
import { AppDetailFooter } from "@/components/surface";
import { messages } from "@lib/messages";
import { toast } from "@comtammatu/ui/components/sonner";
import type {
  BranchDaySummary,
  CloseDaySessionRow,
} from "./data";
import { closeBranchDay } from "./actions";

const copy = messages.settings.branch;

function SessionItem({ session }: { session: CloseDaySessionRow }) {
  return (
    <Item>
      <ItemContent>
        <ItemTitle className="text-sm">
          {session.terminal_name ?? "Ca chi nhánh"}
        </ItemTitle>
        <span className="text-xs text-muted-foreground">
          {session.opened_by_name ?? "—"} ·{" "}
          {formatVNTime(session.opened_at)}
          {session.closed_at ? ` → ${formatVNTime(session.closed_at)}` : ""}
        </span>
        <span className="flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          <span>
            {copy.closeDayCashLabel}:{" "}
            {formatVND(session.closing_cash ?? session.opening_cash)}
          </span>
          {session.cash_difference != null ? (
            <Badge
              variant={
                Math.abs(session.cash_difference) > 0
                  ? "warning"
                  : "secondary"
              }
            >
              {session.cash_difference >= 0 ? "+" : ""}
              {formatVND(session.cash_difference)}
            </Badge>
          ) : null}
        </span>
      </ItemContent>
    </Item>
  );
}

function SessionGroup({
  label,
  sessions,
}: {
  label: string;
  sessions: CloseDaySessionRow[];
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h3>
      <ItemGroup>
        {sessions.map((session) => (
          <SessionItem key={session.id} session={session} />
        ))}
      </ItemGroup>
    </section>
  );
}

export function CloseDayClient({
  branchId,
  summary,
  sessions,
  businessDate,
  loadFailed,
}: {
  branchId: number;
  summary: BranchDaySummary | null;
  sessions: CloseDaySessionRow[];
  businessDate: string;
  loadFailed: boolean;
}) {
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const isClosed = summary?.is_closed === true;
  const openSessionCount = summary?.open_session_count ?? 0;
  const canClose = !isClosed && openSessionCount === 0 && !loadFailed;

  async function handleClose() {
    const ok = await confirm({
      title: copy.closeDayConfirmTitle,
      description: copy.closeDayConfirmDescription,
      confirmText: copy.closeDaySubmit,
    });
    if (!ok) return;
    const closedSessions = sessions.filter((s) => s.status === "closed");
    const cashRecon = closedSessions.map((s) => ({
      sessionId: s.id,
      openingCash: s.opening_cash,
      expectedCash: s.expected_cash ?? 0,
      closingCash: s.closing_cash ?? 0,
      cashDifference: s.cash_difference ?? 0,
    }));
    startTransition(async () => {
      const result = await closeBranchDay({
        branchId,
        businessDate,
        cashRecon,
        note: note.trim() || undefined,
      });
      if (result.success) {
        toast.success(copy.closeDaySuccessToast);
      } else {
        toast.error(result.error ?? copy.closeDayErrorToast);
      }
    });
  }

  if (loadFailed) {
    return (
      <BranchOperatorPanel title={copy.closeDayTitle}>
        <NoteCallout tone="warning" title={copy.closeDayLoadFailedTitle}>
          {copy.closeDayLoadFailedBody}
        </NoteCallout>
      </BranchOperatorPanel>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <BranchOperatorPanel
        title={copy.closeDayTitle}
        description={copy.closeDayDescription}
        headingLevel="h2"
      >
        <BranchOperatorStatusStrip
          items={[
            {
              label: copy.closeDayRevenueLabel,
              value: formatVND(summary?.revenue ?? 0),
              mono: true,
            },
            {
              label: copy.closeDayCashRevenueLabel,
              value: formatVND(summary?.cash_revenue ?? 0),
              mono: true,
            },
            {
              label: copy.closeDayNoncashRevenueLabel,
              value: formatVND(summary?.noncash_revenue ?? 0),
              mono: true,
            },
            {
              label: copy.closeDayPaidOrdersLabel,
              value: String(summary?.paid_orders ?? 0),
              mono: true,
            },
            {
              label: copy.closeDayUnpaidOrdersLabel,
              value: String(summary?.unpaid_orders ?? 0),
              mono: true,
            },
          ]}
        />
      </BranchOperatorPanel>

      <BranchOperatorPanel title={copy.closeDaySessionsLabel} headingLevel="h2">
        {openSessionCount > 0 ? (
          <NoteCallout tone="warning">
            {copy.closeDayOpenSessionsWarning(openSessionCount)}
          </NoteCallout>
        ) : null}
        {sessions.length === 0 ? (
          <ItemGroup>
            <Item>
              <ItemContent>
                <ItemTitle className="text-sm text-muted-foreground">
                  {copy.closeDayNoSessions}
                </ItemTitle>
              </ItemContent>
            </Item>
          </ItemGroup>
        ) : (
          <div className="flex flex-col gap-3">
            <SessionGroup
              label={copy.closeDayOpenSessionsGroup}
              sessions={sessions.filter((s) => s.status === "open")}
            />
            <SessionGroup
              label={copy.closeDayClosedSessionsGroup}
              sessions={sessions.filter((s) => s.status === "closed")}
            />
          </div>
        )}
      </BranchOperatorPanel>

      {isClosed ? (
        <BranchOperatorPanel title={copy.closeDayAlreadyClosed} headingLevel="h2">
          <p className="text-sm text-muted-foreground">
            {copy.closeDayClosedAt}{" "}
            {summary?.closed_at ? formatVNTime(summary.closed_at) : ""}.
            {summary?.note ? (
              <span className="mt-1 block text-foreground">{summary.note}</span>
            ) : null}
          </p>
        </BranchOperatorPanel>
      ) : (
        <BranchOperatorPanel title={copy.closeDayNoteLabel} headingLevel="h2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.closeDayNotePlaceholder}
            maxLength={500}
            rows={3}
            disabled={isPending}
          />
        </BranchOperatorPanel>
      )}

      {!isClosed ? (
        <AppDetailFooter
          sticky
          trailing={
            <Button
              size="touch"
              onClick={handleClose}
              disabled={!canClose || isPending}
              className="w-full sm:w-fit"
            >
              {copy.closeDaySubmit}
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
