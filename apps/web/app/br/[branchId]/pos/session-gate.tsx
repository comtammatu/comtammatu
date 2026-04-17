"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import { ArrowRight, Monitor, Wallet } from "lucide-react";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { EmployeePortalBackControl } from "../employee-portal-back-control";
import { openPosSession } from "./actions";

interface PosTerminal {
  id: number;
  name: string;
  device_id: string | null;
  has_open_session: boolean;
}

interface SessionGateProps {
  branchId: number;
  terminals: PosTerminal[];
}

function InfoCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function SessionGate({ branchId, terminals }: SessionGateProps) {
  const router = useRouter();
  const [terminalId, setTerminalId] = useState<string>("");
  const [openingCash, setOpeningCash] = useState<string>("0");
  const [isPending, startTransition] = useTransition();
  const cashAmount = Number(openingCash);
  const selectedTerminal = terminals.find(
    (terminal) => String(terminal.id) === terminalId,
  );
  const selectedTerminalOccupied = selectedTerminal?.has_open_session ?? false;
  const availableTerminalCount = terminals.filter(
    (terminal) => !terminal.has_open_session,
  ).length;
  const hasValidOpeningCash = !Number.isNaN(cashAmount) && cashAmount >= 0;

  const canOpen =
    terminalId !== "" && !selectedTerminalOccupied && !isPending;
  const setupProgress = terminalId !== "" ? (hasValidOpeningCash ? 74 : 42) : 18;
  const setupSteps = [
    {
      label: "Chọn máy",
      meta: "Chọn terminal",
      state: terminalId !== "" ? "done" : "current",
    },
    {
      label: "Tiền đầu ca",
      meta: "Nhập số dư",
      state:
        terminalId !== ""
          ? hasValidOpeningCash
            ? "done"
            : "current"
          : "todo",
    },
    {
      label: "Sẵn sàng mở",
      meta: "Vào POS",
      state: canOpen ? "current" : "todo",
    },
  ] as const;

  const handleOpen = useCallback(() => {
    if (!canOpen) return;

    if (Number.isNaN(cashAmount) || cashAmount < 0) {
      toast.error("Số tiền đầu ca không hợp lệ");
      return;
    }

    startTransition(async () => {
      const result = await openPosSession(
        branchId,
        Number(terminalId),
        cashAmount,
      );

      if (result.success) {
        toast.success("Mở ca thành công");
        router.refresh();
      } else {
        toast.error(result.error ?? "Không thể mở ca");
      }
    });
  }, [canOpen, branchId, terminalId, openingCash, router]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <EmployeePortalBackControl className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6" />

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-6 lg:grid-cols-2">
        <section className="space-y-5">
          <div className="rounded-lg border bg-card shadow-sm p-5 sm:p-6">
            <div className="relative space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">POS terminal</p>
                  <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Mở ca nhanh, vào POS ngay.
                  </h1>
                  <p className="max-w-xl text-sm leading-7 text-muted-foreground">
                    Chọn máy POS và nhập tiền đầu ca để bắt đầu.
                  </p>
                </div>
                <div className="rounded-full border border-primary/15 bg-card px-3 py-1.5 text-xs font-semibold text-primary shadow-sm">
                  Vào POS
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                  <span>Tiến độ vào ca</span>
                  <span>{String(Math.round(setupProgress))}% sẵn sàng</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${setupProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {setupSteps.map((step, index) => (
                  <div
                    key={step.label}
                    data-state={step.state}
                    className="rounded-lg border bg-card shadow-sm p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-bold">{index + 1}</div>
                      <div className="space-y-1">
                        <p className="text-sm font-semibold">{step.label}</p>
                        <p className="text-xs leading-5 text-muted-foreground">
                          {step.meta}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoCard
              title="Đúng thiết bị"
              description="Mỗi máy mở ca riêng."
              icon={<Monitor className="size-5" />}
            />
            <InfoCard
              title="Kiểm soát tiền mặt"
              description="Lưu tiền đầu ca để đối soát."
              icon={<Wallet className="size-5" />}
            />
          </div>
        </section>

        <section
          className={cn(
            "rounded-lg border bg-card shadow-sm",
            "mx-auto w-full max-w-md p-6 sm:p-7",
          )}
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Monitor className="size-7" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Chi nhánh #{branchId}</p>
            <h2 className="mt-2 text-2xl font-semibold text-foreground">
              Mở ca bán hàng
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Chọn máy POS và nhập số dư đầu ca.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="terminal">Máy POS</Label>
              {terminals.length === 0 ? (
                <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                  Chưa có máy POS. Liên hệ quản lý để thiết lập trước.
                </div>
              ) : availableTerminalCount === 0 ? (
                <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                  Tất cả máy POS đang có ca mở. Hãy đóng ca hiện tại trước.
                </div>
              ) : (
                <Select value={terminalId} onValueChange={setTerminalId}>
                  <SelectTrigger id="terminal" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-white">
                    <SelectValue placeholder="Chọn máy POS" />
                  </SelectTrigger>
                  <SelectContent>
                    {terminals.map((terminal) => (
                      <SelectItem
                        key={terminal.id}
                        value={String(terminal.id)}
                        disabled={terminal.has_open_session}
                      >
                        {terminal.has_open_session
                          ? `${terminal.name} • Đang có ca mở`
                          : terminal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {selectedTerminalOccupied ? (
              <div className="rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm leading-6 text-warning">
                Máy POS này đang có ca mở. Chọn máy khác hoặc đóng ca hiện tại
                trước khi tiếp tục.
              </div>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="opening-cash">Tiền đầu ca (VND)</Label>
              <Input
                id="opening-cash"
                type="number"
                min="0"
                step="1000"
                value={openingCash}
                onChange={(event) => setOpeningCash(event.target.value)}
                placeholder="0"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background bg-white"
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/35 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Trạng thái
                  </p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    {canOpen
                      ? "Có thể mở ca ngay"
                      : selectedTerminalOccupied
                        ? "Máy POS đang bận"
                        : terminalId === ""
                        ? "Cần chọn terminal"
                        : "Kiểm tra thông tin đầu ca"}
                  </p>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </div>
            </div>

            <Button
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background mt-2 w-full"
              size="lg"
              disabled={!canOpen}
              onClick={handleOpen}
            >
              {isPending ? (
                <>
                  <Spinner className="mr-2" />
                  Đang mở ca…
                </>
              ) : (
                "Mở ca"
              )}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
