"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { formatVND } from "@comtammatu/shared/format";
import {
  Monitor as IconDeviceDesktop,
  Banknote as IconCash,
  Clock as IconClock,
} from "lucide-react";

export interface OpenSessionForPicker {
  id: number;
  terminal_id: number;
  opened_at: string;
  opening_cash: number | string;
  pos_terminals: { id: number; name: string } | null;
}

interface MultiSessionPickerProps {
  sessions: OpenSessionForPicker[];
}

function formatRelative(opened_at: string): string {
  const ms = Date.now() - new Date(opened_at).getTime();
  if (Number.isNaN(ms) || ms < 0) return "vừa mở";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "vừa mở";
  if (minutes < 60) return `${String(minutes)} phút trước`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) {
    return remMin > 0
      ? `${String(hours)}h${String(remMin)}p trước`
      : `${String(hours)} giờ trước`;
  }
  const days = Math.floor(hours / 24);
  return `${String(days)} ngày trước`;
}

/**
 * Render-time disambiguation surface — only mounted when the branch has 2+
 * open POS sessions and the URL has no `?terminal=X` param. User taps a
 * card → push the terminal id into the URL → page re-renders with the
 * deterministic session bound to that terminal.
 *
 * Why a picker (not auto-pick): MVP previously took the latest-opened
 * session, which silently mis-tagged orders to the wrong terminal when
 * cashier A and waiter B each had their own ca open. Picker forces
 * intentional selection so reconciliation aligns with cash drawer.
 */
export function MultiSessionPicker({ sessions }: MultiSessionPickerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingTerminalId, setPendingTerminalId] = useState<number | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const pick = (terminalId: number) => {
    if (isPending) return;
    setPendingTerminalId(terminalId);
    const params = new URLSearchParams(searchParams.toString());
    params.set("terminal", String(terminalId));
    startTransition(() => {
      router.replace(`?${params.toString()}`);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight">
          Chọn máy POS bạn đang dùng
        </h2>
        <p className="text-base leading-6 text-muted-foreground">
          Chi nhánh có {sessions.length} ca POS đang mở. Chọn đúng máy bạn đang
          ngồi để mọi đơn được tag vào đúng ca và đối soát tiền cuối ca không
          lệch.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {sessions.map((session) => {
          const terminalName =
            session.pos_terminals?.name ?? `Máy POS #${String(session.terminal_id)}`;
          const opening = Number(session.opening_cash);
          const isThisPending =
            pendingTerminalId === session.terminal_id && isPending;
          return (
            <li key={session.id}>
              <Card>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <IconDeviceDesktop
                      className="size-7 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-base font-semibold">
                        {terminalName}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        Ca #{String(session.id)}
                      </span>
                    </div>
                  </div>

                  <dl className="flex flex-col gap-1.5 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <IconClock className="size-4" />
                      <dt className="sr-only">Mở lúc</dt>
                      <dd>{formatRelative(session.opened_at)}</dd>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <IconCash className="size-4" />
                      <dt className="sr-only">Tiền mở ca</dt>
                      <dd>Mở két: {formatVND(opening)}</dd>
                    </div>
                  </dl>

                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => pick(session.terminal_id)}
                  >
                    {isThisPending && <Spinner data-icon="inline-start" />}
                    Dùng máy này
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      <p className="text-sm text-muted-foreground">
        Nếu không có máy nào đúng, hãy nhờ thu ngân/quản lý mở ca trên đúng máy
        bạn đang ngồi rồi tải lại trang.
      </p>
    </div>
  );
}
