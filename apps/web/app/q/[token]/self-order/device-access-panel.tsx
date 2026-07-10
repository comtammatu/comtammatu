"use client";

import { ShieldCheck as IconShield } from "lucide-react";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { formatVNTime } from "@comtammatu/shared/time";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppSection } from "@/components/surface";
import type { PublicSelfOrderSnapshot } from "@lib/self-order/contracts";

interface DeviceAccessPanelProps {
  snapshot: PublicSelfOrderSnapshot;
  isPending: boolean;
  error: string | null;
  onRequestJoin: () => void;
  onRefreshPairingCode: () => void;
}

export function DeviceAccessPanel({
  snapshot,
  isPending,
  error,
  onRequestJoin,
  onRefreshPairingCode,
}: DeviceAccessPanelProps) {
  if (snapshot.deviceRecovery === "expired") {
    return (
      <div className="px-3 pt-2">
        <NoteCallout
          tone="warning"
          icon={<IconShield />}
          label={SELF_ORDER_VI.deviceExpiredTitle}
          aria-live="polite"
        >
          <div className="flex flex-col gap-3">
            <p>{SELF_ORDER_VI.deviceExpiredDescription}</p>
            {snapshot.seatingAccess === "join_required" ? (
              <Button
                type="button"
                variant="outline"
                size="touch"
                disabled={isPending}
                onClick={onRequestJoin}
              >
                {isPending ? <Spinner className="size-4" /> : <IconShield />}
                {SELF_ORDER_VI.requestJoin}
              </Button>
            ) : null}
          </div>
        </NoteCallout>
      </div>
    );
  }

  if (
    snapshot.deviceAccess === "rejected" ||
    snapshot.deviceAccess === "revoked"
  ) {
    return (
      <div className="px-3 pt-2">
        <NoteCallout
          tone="warning"
          icon={<IconShield />}
          label={SELF_ORDER_VI.deviceAccessDeniedTitle}
          aria-live="polite"
        >
          {snapshot.deviceAccess === "rejected"
            ? SELF_ORDER_VI.deviceRejectedDescription
            : SELF_ORDER_VI.deviceRevokedDescription}
        </NoteCallout>
      </div>
    );
  }

  if (
    snapshot.access === "public" &&
    snapshot.seatingAccess === "join_required"
  ) {
    return (
      <div className="px-3 pt-2">
        <NoteCallout
          tone="warning"
          icon={<IconShield />}
          label={SELF_ORDER_VI.joinRequiredTitle}
        >
          <div className="flex flex-col gap-3">
            <p>{SELF_ORDER_VI.joinRequiredDescription}</p>
            {error ? (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            ) : null}
            <Button
              type="button"
              size="touch"
              disabled={isPending}
              onClick={onRequestJoin}
            >
              {isPending ? <Spinner className="size-4" /> : <IconShield />}
              {SELF_ORDER_VI.requestJoin}
            </Button>
          </div>
        </NoteCallout>
      </div>
    );
  }

  if (
    snapshot.access !== "origin_pending" &&
    snapshot.access !== "join_pending"
  ) {
    return null;
  }

  const pairingCode = snapshot.deviceRequest?.pairingCode;
  const deviceExpiresAt = formatVNTime(snapshot.deviceRequest?.expiresAt, "");
  return (
    <div className="px-3 pt-2">
      <AppSection
        title={SELF_ORDER_VI.devicePendingTitle}
        description={
          snapshot.access === "origin_pending"
            ? SELF_ORDER_VI.originPendingDescription
            : SELF_ORDER_VI.joinPendingDescription
        }
        icon={<IconShield />}
        size="sm"
      >
        <div className="flex flex-col gap-3" aria-live="polite">
          {pairingCode ? (
            <div className="rounded-md bg-muted/50 p-4 text-center">
              <p className="text-xs text-muted-foreground">
                {SELF_ORDER_VI.pairingCodeLabel}
              </p>
              <p
                className="font-mono text-3xl font-bold tracking-[0.3em] tabular-nums"
                aria-label={`${SELF_ORDER_VI.pairingCodeLabel}: ${pairingCode}`}
              >
                {pairingCode}
              </p>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="touch"
              disabled={isPending}
              onClick={onRefreshPairingCode}
            >
              {isPending ? <Spinner className="size-4" /> : <IconShield />}
              {SELF_ORDER_VI.refreshPairingCode}
            </Button>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {deviceExpiresAt ? (
            <p className="text-xs text-muted-foreground">
              {SELF_ORDER_VI.deviceApprovalExpiresAt(deviceExpiresAt)}
            </p>
          ) : null}
        </div>
      </AppSection>
    </div>
  );
}
