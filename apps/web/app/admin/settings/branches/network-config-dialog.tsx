"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  Globe as IconGlobe,
  Plus as IconPlus,
  Shield as IconShield,
  ShieldOff as IconShieldOff,
  AlertTriangle as IconAlertTriangle,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@comtammatu/ui/components/dialog";
import { toast } from "@comtammatu/ui/components/sonner";
import { ACTIONS_VI, ERRORS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { AppEmptyState } from "@/components/surface";
import { messages } from "@lib/messages";
import {
  listTrustedIps,
  revokeTrustedIp,
  trustCurrentIp,
  type TrustedIpRow,
} from "./network-config-actions";

interface NetworkConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branch: {
    id: number;
    name: string;
  };
}

const GRACE_MS = 30 * 60 * 1000;

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

export function NetworkConfigDialog({
  open,
  onOpenChange,
  branch,
}: NetworkConfigDialogProps) {
  const [rows, setRows] = useState<TrustedIpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [trustPending, startTrustTransition] = useTransition();
  const [revokePendingId, setRevokePendingId] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await listTrustedIps({ branchId: branch.id });
    setLoading(false);
    if (result.success && result.data) {
      setRows(result.data as TrustedIpRow[]);
    } else if (!result.success) {
      toast.error(result.error ?? ERRORS_VI.fallback);
    }
  }, [branch.id]);

  useEffect(() => {
    if (open) {
      void refresh();
    } else {
      setRows([]);
    }
  }, [open, refresh]);

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

  const activeRows = rows.filter((r) => r.revoked_at === null);
  const revokedRows = rows.filter((r) => r.revoked_at !== null);
  const hasFreshTrust = activeRows.some((r) => isFresh(r.last_seen_at));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconShield className="size-5" />
            {messages.settings.network.title(branch.name)}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            {messages.settings.network.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status banner */}
          {!loading && activeRows.length === 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">
                  {messages.settings.network.noTrustedTitle}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {messages.settings.network.noTrustedDescription}
                </p>
              </div>
            </div>
          )}

          {!loading && activeRows.length > 0 && !hasFreshTrust && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">
                  {messages.settings.network.staleTitle}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {messages.settings.network.staleDescription}
                </p>
              </div>
            </div>
          )}

          {/* Bootstrap action */}
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
                {trustPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <IconPlus />
                )}
                {messages.settings.network.trustCurrentButton}
              </Button>
            </ItemActions>
          </Item>

          {/* Active list */}
          <div>
            <h3 className="font-heading mb-2 text-sm font-medium">
              {messages.settings.network.activeTitle(activeRows.length)}
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Spinner className="mr-2" />
                {STATES_VI.loading}
              </div>
            ) : activeRows.length === 0 ? (
              <AppEmptyState
                className="border-dashed bg-transparent py-6"
                title={messages.settings.network.emptyTrusted}
                compact
              />
            ) : (
              <ItemGroup>
                {activeRows.map((row) => (
                  <Item
                    key={row.id}
                    variant="outline"
                    className="sm:flex-nowrap"
                  >
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
                              ? "border-success/40 text-success"
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
                            className="border-warning/40 text-warning"
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

          {/* Revoked list (collapsed by default visually) */}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {ACTIONS_VI.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
