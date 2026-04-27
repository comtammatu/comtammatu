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
        toast.success(ip ? `Đã tin cậy IP ${ip}` : "Đã tin cậy IP hiện tại");
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
        toast.success("Đã thu hồi IP");
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconShield className="size-5" />
            Cổng mạng POS/KDS — {branch.name}
          </DialogTitle>
          <DialogDescription className="text-sm leading-6">
            POS và KDS chỉ mở từ thiết bị có cùng IP công cộng (cùng wifi)
            với máy in agent của chi nhánh. Print-agent tự đăng ký IP mỗi 5
            phút. Nút bên dưới cho phép tin cậy IP hiện tại của bạn để bootstrap
            khi agent chưa chạy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Status banner */}
          {!loading && activeRows.length === 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Chưa có IP nào được tin cậy</p>
                <p className="mt-1 text-muted-foreground">
                  Đứng trên wifi cửa hàng và bấm "Tin cậy IP hiện tại" để mở
                  POS/KDS, hoặc cài print-agent — agent sẽ tự đăng ký IP.
                </p>
              </div>
            </div>
          )}

          {!loading && activeRows.length > 0 && !hasFreshTrust && (
            <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              <IconAlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Tất cả IP đã quá 30 phút</p>
                <p className="mt-1 text-muted-foreground">
                  Cashier đang bị chặn POS. Kiểm tra agent có chạy không, hoặc
                  bấm tin cậy lại IP hiện tại.
                </p>
              </div>
            </div>
          )}

          {/* Bootstrap action */}
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Tin cậy IP hiện tại</p>
              <p className="text-xs text-muted-foreground">
                Ghi nhận IP công cộng của thiết bị bạn đang dùng. Phải đứng
                trên wifi cửa hàng khi bấm.
              </p>
            </div>
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
              Tin cậy IP hiện tại
            </Button>
          </div>

          {/* Active list */}
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Đang hoạt động ({activeRows.length})
            </h3>
            {loading ? (
              <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                <Spinner className="mr-2" />
                {STATES_VI.loading}
              </div>
            ) : activeRows.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                Chưa có IP tin cậy.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {activeRows.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
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
                            : "thủ công"}
                        </Badge>
                        {!isFresh(row.last_seen_at) && (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-warning"
                          >
                            quá hạn
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hoạt động {formatAge(row.last_seen_at)}
                        {row.registered_by_agent_id
                          ? ` • ${row.registered_by_agent_id}`
                          : ""}
                      </p>
                    </div>
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
                      Thu hồi
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Revoked list (collapsed by default visually) */}
          {revokedRows.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Đã thu hồi ({revokedRows.length})
              </h3>
              <ul className="divide-y rounded-lg border bg-muted/20">
                {revokedRows.slice(0, 5).map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
                  >
                    <span className="font-mono">{row.ip_address}</span>
                    <span>•</span>
                    <span>
                      Thu hồi{" "}
                      {row.revoked_at ? formatAge(row.revoked_at) : "không rõ"}
                    </span>
                  </li>
                ))}
              </ul>
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
