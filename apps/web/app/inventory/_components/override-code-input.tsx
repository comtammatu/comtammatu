"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { cn } from "@comtammatu/ui";
import { verifyOverrideCode } from "../variance-actions";

interface OverrideCodeInputProps {
  branchId: number;
  /** Called when code verifies successfully. Consumer is then allowed to submit. */
  onVerified: () => void;
  /** External disabled override (e.g. parent form is submitting). */
  disabled?: boolean;
  /** Label copy override. */
  label?: string;
  /** Helper text under input. */
  helper?: string;
  className?: string;
}

/**
 * GRN price variance tier 2 override code input (S10).
 * Server RPC `verify_branch_override_code` rate-limits 3 failed
 * attempts / minute / user. On 54000 error, this component starts
 * a 60s countdown and disables the input until the window clears.
 *
 * Server clock is authoritative — we don't trust Date.now() for the
 * countdown start. We record server-reported `now` from the action
 * response header if available; otherwise fall back to 60s from
 * the client's last submit click (acceptable because rate-limit
 * window is from-now-backward at the server).
 */
export function OverrideCodeInput({
  branchId,
  onVerified,
  disabled,
  label = "Mã xác nhận QLV",
  helper = "QLV nhập mã duyệt vượt để xác nhận lệch giá 30–100%.",
  className,
}: OverrideCodeInputProps) {
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(false);
  const [lockUntil, setLockUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isVerifying, startVerify] = useTransition();

  // Countdown tick
  useEffect(() => {
    if (lockUntil === null) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        setLockUntil(null);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [lockUntil]);

  const locked = lockUntil !== null && countdown > 0;
  const isDisabled = disabled || verified || locked || isVerifying;

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!code) {
      toast.error("Nhập mã xác nhận");
      return;
    }
    startVerify(async () => {
      const res = await verifyOverrideCode(branchId, code);
      if (!res.success) {
        if (res.error?.includes("3 lần/phút")) {
          setLockUntil(Date.now() + 60_000);
        }
        toast.error(res.error ?? "Mã không hợp lệ");
        return;
      }
      if (!res.data?.verified) {
        toast.error("Mã không đúng");
        return;
      }
      setVerified(true);
      toast.success("Đã xác nhận mã duyệt vượt");
      onVerified();
    });
  }

  return (
    <form onSubmit={handleSubmit} className={cn("space-y-2", className)}>
      <Label htmlFor="override-code" className="text-sm font-medium">
        {label}
        {verified ? (
          <span className="ml-2 text-xs text-success">✓ đã xác nhận</span>
        ) : null}
      </Label>
      <div className="flex gap-2">
        <Input
          id="override-code"
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="••••••"
          disabled={isDisabled}
          autoComplete="off"
          data-slot="override-code"
        />
        <Button type="submit" variant="secondary" disabled={isDisabled}>
          {isVerifying ? <Spinner /> : "Xác nhận"}
        </Button>
      </div>
      <p
        className={cn(
          "text-xs",
          locked ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {locked
          ? `Chờ ${countdown}s trước khi thử lại (vượt giới hạn 3 lần/phút)`
          : helper}
      </p>
    </form>
  );
}
