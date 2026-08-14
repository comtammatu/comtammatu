"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Globe as IconGlobe,
  Plus as IconPlus,
  Shield as IconShield,
  ShieldOff as IconShieldOff,
  AlertTriangle as IconAlertTriangle,
  Siren as IconSiren,
} from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { formatVNDateTime } from "@comtammatu/shared/time";
import { AppEmptyState } from "@/components/surface";
import { AppDialog } from "@/components/form/form-dialog";
import { confirm } from "@/components/confirm-dialog";
import { messages } from "@lib/messages";
import {
  activateNetworkGateBypass,
  getNetworkGateBypass,
  listTrustedIps,
  revokeNetworkGateBypass,
  revokeTrustedIp,
  trustCurrentIp,
  type NetworkGateBypassDurationKind,
  type NetworkGateBypassRow,
  type TrustedIpRow,
} from "./network-config-actions";

interface NetworkBranchRef {
  id: number;
  name: string;
}

interface NetworkConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: NetworkBranchRef;
}

interface NetworkConfigPanelProps {
  branch: NetworkBranchRef;
  /** When false, skip the initial fetch until the parent is ready (dialog open). */
  active?: boolean;
}

const GRACE_MS = 30 * 60 * 1000;

const DURATION_PRESETS: {
  kind: NetworkGateBypassDurationKind;
  label: string;
}[] = [
  { kind: "1h", label: messages.settings.network.duration1h },
  { kind: "2h", label: messages.settings.network.duration2h },
  { kind: "4h", label: messages.settings.network.duration4h },
  { kind: "pos_shift", label: messages.settings.network.durationPosShift },
  { kind: "business_day", label: messages.settings.network.durationBusinessDay },
];

function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "vừa xong";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

function isFresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < GRACE_MS;
}

function durationLabel(kind: NetworkGateBypassDurationKind): string {
  const preset = DURATION_PRESETS.find((p) => p.kind === kind);
  return preset?.label ?? kind;
}

function bypassUntilLabel(row: NetworkGateBypassRow): string {
  if (row.duration_kind === "pos_shift") {
    return messages.settings.network.untilPosShiftClose;
  }
  if (row.duration_kind === "business_day") {
    return messages.settings.network.untilBusinessDayEnd(
      formatVNDateTime(row.expires_at),
    );
  }
  return formatVNDateTime(row.expires_at);
}

export function NetworkConfigPanel({
  branch,
  active = true,
}: NetworkConfigPanelProps) {
  const [rows, setRows] = useState<TrustedIpRow[]>([]);
  const [bypass, setBypass] = useState<NetworkGateBypassRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [trustPending, startTrustTransition] = useTransition();
  const [bypassPendingKind, setBypassPendingKind] =
    useState<NetworkGateBypassDurationKind | null>(null);
  const [revokeBypassPending, setRevokeBypassPending] = useState(false);
  const [revokePendingId, setRevokePendingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [ipsResult, bypassResult] = await Promise.all([
      listTrustedIps({ branchId: branch.id }),
      getNetworkGateBypass({ branchId: branch.id }),
    ]);
    setLoading(false);
    if (ipsResult.success && ipsResult.data) {
      setRows(ipsResult.data as TrustedIpRow[]);
    } else if (!ipsResult.success) {
      toast.error(ipsResult.error ?? ERRORS_VI.fallback);
    }
    if (bypassResult.success) {
      setBypass((bypassResult.data as NetworkGateBypassRow | null) ?? null);
    } else if (!bypassResult.success) {
      toast.error(bypassResult.error ?? ERRORS_VI.fallback);
    }
  }, [branch.id]);

  useEffect(() => {
    if (active) {
      void refresh();
    } else {
      setRows([]);
      setBypass(null);
    }
  }, [active, refresh]);

  function handleTrustCurrent() {
    startTrustTransition(async () => {
      const result = await trustCurrentIp({ branchId: branch.id });
      if (result.success) {
        const ip = (result.data as { ip?: string } | undefined)?.ip;
        toast.success(messages.settings.network.trustedIp(ip));
        await refresh();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    });
  }

  function handleRevoke(trustedIpId: number) {
    setRevokePendingId(trustedIpId);
    void (async () => {
      const result = await revokeTrustedIp({
        branchId: branch.id,
        trustedIpId,
      });
      setRevokePendingId(null);
      if (result.success) {
        toast.success(messages.settings.network.revokedIp);
        await refresh();
      } else {
        toast.error(result.error ?? ERRORS_VI.fallback);
      }
    })();
  }

  async function handleActivateBypass(kind: NetworkGateBypassDurationKind) {
    const label = durationLabel(kind);
    const ok = await confirm({
      title: messages.settings.network.emergencyConfirmTitle,
      description: messages.settings.network.emergencyConfirmDescription(label),
      details: [
        {
          label: messages.settings.network.durationDetailLabel,
          value: label,
        },
      ],
      confirmText: messages.settings.network.emergencyTitle,
      variant: "destructive",
    });
    if (!ok) return;

    setBypassPendingKind(kind);
    const result = await activateNetworkGateBypass({
      branchId: branch.id,
      durationKind: kind,
    });
    setBypassPendingKind(null);
    if (result.success) {
      toast.success(messages.settings.network.emergencyActivated);
      await refresh();
    } else {
      toast.error(result.error ?? ERRORS_VI.fallback);
    }
  }

  async function handleRevokeBypass() {
    setRevokeBypassPending(true);
    const result = await revokeNetworkGateBypass({ branchId: branch.id });
    setRevokeBypassPending(false);
    if (result.success) {
      toast.success(messages.settings.network.emergencyRevoked);
      await refresh();
    } else {
      toast.error(result.error ?? ERRORS_VI.fallback);
    }
  }

  const activeRows = rows.filter((r) => r.revoked_at === null);
  const revokedRows = rows.filter((r) => r.revoked_at !== null);
  const hasFreshTrust = activeRows.some((r) => isFresh(r.last_seen_at));

  return (
    <div className="flex flex-col gap-4">
      <Alert className="border-warning/20 bg-warning/10">
        <IconSiren className="size-4 text-warning" />
        <AlertTitle>{messages.settings.network.emergencyTitle}</AlertTitle>
        <AlertDescription>
          {messages.settings.network.emergencyDescription}
        </AlertDescription>
      </Alert>

      {bypass ? (
        <Item variant="outline" className="sm:flex-nowrap">
          <ItemContent className="min-w-0">
            <ItemTitle className="text-sm">
              {messages.settings.network.emergencyActiveTitle}
              <Badge
                variant="outline"
                className="border-warning/20 text-warning"
              >
                {durationLabel(bypass.duration_kind)}
              </Badge>
            </ItemTitle>
            <ItemDescription>
              {messages.settings.network.emergencyActiveUntil(
                bypassUntilLabel(bypass),
              )}
            </ItemDescription>
          </ItemContent>
          <ItemActions className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRevokeBypass()}
              disabled={revokeBypassPending}
            >
              {revokeBypassPending ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <IconShieldOff />
              )}
              {messages.settings.network.emergencyClose}
            </Button>
          </ItemActions>
        </Item>
      ) : (
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((preset) => (
            <Button
              key={preset.kind}
              size="sm"
              variant="outline"
              disabled={bypassPendingKind !== null || loading}
              onClick={() => void handleActivateBypass(preset.kind)}
            >
              {bypassPendingKind === preset.kind ? (
                <Spinner data-icon="inline-start" />
              ) : null}
              {preset.label}
            </Button>
          ))}
        </div>
      )}

      {!loading && !bypass && activeRows.length === 0 && (
        <Alert className="border-warning/20 bg-warning/10">
          <IconAlertTriangle className="size-4 text-warning" />
          <AlertTitle>{messages.settings.network.noTrustedTitle}</AlertTitle>
          <AlertDescription>
            {messages.settings.network.noTrustedDescription}
          </AlertDescription>
        </Alert>
      )}

      {!loading && !bypass && activeRows.length > 0 && !hasFreshTrust && (
        <Alert className="border-warning/20 bg-warning/10">
          <IconAlertTriangle className="size-4 text-warning" />
          <AlertTitle>{messages.settings.network.staleTitle}</AlertTitle>
          <AlertDescription>
            {messages.settings.network.staleDescription}
          </AlertDescription>
        </Alert>
      )}

      <Item variant="muted" className="sm:flex-nowrap">
        <ItemContent>
          <ItemTitle className="text-sm">
            {messages.settings.network.trustCurrentTitle}
          </ItemTitle>
          <ItemDescription>
            {messages.settings.network.trustCurrentDescription}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="ml-auto">
          <Button
            size="sm"
            onClick={handleTrustCurrent}
            disabled={trustPending}
          >
            {trustPending ? <Spinner data-icon="inline-start" /> : <IconPlus />}
            {messages.settings.network.trustCurrentButton}
          </Button>
        </ItemActions>
      </Item>

      <div>
        <h3 className="font-heading mb-2 text-sm font-medium">
          {messages.settings.network.activeTitle(activeRows.length)}
        </h3>
        {loading ? (
          <div className="flex min-h-16 items-center justify-center text-sm text-muted-foreground">
            <Spinner className="mr-2" />
            {STATES_VI.loading}
          </div>
        ) : activeRows.length === 0 ? (
          <AppEmptyState
            className="border-dashed bg-transparent"
            title={messages.settings.network.emptyTrusted}
            compact
          />
        ) : (
          <ItemGroup>
            {activeRows.map((row) => (
              <Item key={row.id} variant="outline" className="sm:flex-nowrap">
                <ItemContent className="min-w-0">
                  <ItemTitle className="line-clamp-none flex-wrap text-sm">
                    <IconGlobe className="size-4 text-muted-foreground" />
                    <span className="font-mono text-sm font-medium">
                      {row.ip_address}
                    </span>
                    <Badge
                      variant="outline"
                      className={
                        row.registered_via === "agent"
                          ? "border-success/20 text-success"
                          : "border-border"
                      }
                    >
                      {row.registered_via === "agent"
                        ? "agent"
                        : messages.settings.network.manual}
                    </Badge>
                    {!isFresh(row.last_seen_at) && (
                      <Badge
                        variant="outline"
                        className="border-warning/20 text-warning"
                      >
                        {messages.settings.network.expired}
                      </Badge>
                    )}
                  </ItemTitle>
                  <ItemDescription>
                    {messages.settings.network.activeMeta(
                      formatAge(row.last_seen_at),
                      row.registered_by_agent_id,
                    )}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(row.id)}
                    disabled={revokePendingId === row.id}
                  >
                    {revokePendingId === row.id ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <IconShieldOff />
                    )}
                    {messages.settings.network.revoke}
                  </Button>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        )}
      </div>

      {revokedRows.length > 0 && (
        <div>
          <h3 className="font-heading mb-2 text-sm font-medium text-muted-foreground">
            {messages.settings.network.revokedTitle(revokedRows.length)}
          </h3>
          <ItemGroup data-size="xs">
            {revokedRows.slice(0, 5).map((row) => (
              <Item key={row.id} variant="muted" size="xs">
                <ItemContent className="flex-row items-center gap-2">
                  <span className="font-mono">{row.ip_address}</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground">
                    {messages.settings.network.revokedMeta(
                      row.revoked_at
                        ? formatAge(row.revoked_at)
                        : messages.settings.network.unknown,
                    )}
                  </span>
                </ItemContent>
              </Item>
            ))}
          </ItemGroup>
        </div>
      )}
    </div>
  );
}

export function NetworkConfigDialog({
  open,
  onOpenChange,
  branch,
}: NetworkConfigDialogProps) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        <span className="flex items-center gap-2">
          <IconShield className="size-5" />
          {messages.settings.network.title(branch.name)}
        </span>
      }
      description={messages.settings.network.description}
      contentClassName="sm:max-w-2xl"
      footer={
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          {ACTIONS_VI.close}
        </Button>
      }
    >
      <NetworkConfigPanel branch={branch} active={open} />
    </AppDialog>
  );
}
