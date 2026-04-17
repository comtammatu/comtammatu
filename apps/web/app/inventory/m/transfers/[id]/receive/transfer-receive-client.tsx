"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  PackageCheck,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import { Card } from "@comtammatu/ui/components/card";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Checkbox } from "@comtammatu/ui/components/checkbox";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";
import { MobilePage } from "../../../../_components/mobile/mobile-page";
import { MobileSectionHeader } from "../../../../_components/mobile/mobile-section-header";
import { TouchButton } from "../../../../_components/mobile/touch-button";
import { NumberPadSheet } from "../../../../_components/mobile/number-pad-sheet";
import { formatQty } from "../../../../_lib/format";
import {
  transferConfirmReceive,
  transferReceive,
} from "../../../../transfer-actions";

type LineInput = {
  id: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  sentQty: number;
  receivedQty: number;
};

type Props = {
  transfer: {
    id: number;
    code: string;
    status: string;
    fromBranchName: string;
    toBranchName: string;
    notes: string | null;
    shippedAt: string | null;
  };
  lines: LineInput[];
};

const READY_STATES = ["in_transit", "confirmed_receive"];

export function TransferReceiveClient({ transfer, lines }: Props) {
  const router = useRouter();
  const [values, setValues] = React.useState<Record<number, number>>(() => {
    const next: Record<number, number> = {};
    for (const line of lines) {
      next[line.ingredientId] =
        line.receivedQty > 0 ? line.receivedQty : line.sentQty;
    }
    return next;
  });
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [shortNote, setShortNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<LineInput | null>(null);
  const [startingReceive, setStartingReceive] = React.useState(false);

  const totals = React.useMemo(() => {
    let sent = 0;
    let received = 0;
    let shortLines = 0;
    for (const line of lines) {
      sent += line.sentQty;
      const got = values[line.ingredientId] ?? 0;
      received += got;
      if (got < line.sentQty) shortLines += 1;
    }
    return { sent, received, shortLines };
  }, [values, lines]);

  const needsReceiveMode = transfer.status === "in_transit";
  const canAct = READY_STATES.includes(transfer.status);
  const hasShort = totals.shortLines > 0;
  const noteOk = !hasShort || shortNote.trim().length >= 3;
  const canSubmit =
    canAct && !needsReceiveMode && acknowledged && noteOk && !pending;

  async function startReceiveMode() {
    setStartingReceive(true);
    setError(null);
    const res = await transferConfirmReceive(transfer.id);
    setStartingReceive(false);
    if (!res.success) {
      setError(res.error ?? "Không thể bắt đầu kiểm nhận.");
      return;
    }
    router.refresh();
  }

  async function submit() {
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    const items: Record<string, { qty: number; note?: string }> = {};
    for (const line of lines) {
      const qty = values[line.ingredientId] ?? 0;
      items[String(line.ingredientId)] = {
        qty,
        ...(qty < line.sentQty && shortNote.trim()
          ? { note: shortNote.trim() }
          : {}),
      };
    }
    const res = await transferReceive(transfer.id, items);
    setPending(false);
    if (!res.success) {
      setError(res.error ?? "Không thể xác nhận nhập.");
      return;
    }
    router.push(`/inventory/m/transfers?tab=history`);
    router.refresh();
  }

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m/transfers?tab=receive"
        backLabel="Về danh sách"
        eyebrow="Kiểm nhận"
        title={transfer.code}
      />

      <Card className="gap-2 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <PackageCheck className="size-5 text-primary" />
          <span className="truncate">{transfer.fromBranchName}</span>
          <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{transfer.toBranchName}</span>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Tổng xuất
            </p>
            <p className="text-lg font-semibold tabular-nums">
              {formatQty(totals.sent)}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Tổng nhận
            </p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                hasShort ? "text-warning" : "text-success",
              )}
            >
              {formatQty(totals.received)}
            </p>
          </div>
        </div>
        {hasShort ? (
          <p className="text-xs text-warning-foreground">
            {totals.shortLines} mặt hàng thiếu so với phiếu xuất.
          </p>
        ) : null}
        {transfer.notes ? (
          <p className="rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            {transfer.notes}
          </p>
        ) : null}
      </Card>

      {needsReceiveMode ? (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Phiếu đang vận chuyển. Xác nhận bắt đầu kiểm nhận để chỉnh số
              lượng thực nhận.
            </span>
            <Button
              type="button"
              size="lg"
              onClick={startReceiveMode}
              disabled={startingReceive}
              className="h-12 w-full text-sm"
            >
              {startingReceive ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Bắt đầu kiểm nhận
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <section className="flex flex-col gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {lines.length} mặt hàng trong phiếu
        </p>
        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const got = values[line.ingredientId] ?? 0;
            const short = got < line.sentQty;
            return (
              <li key={line.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card px-3 py-3 transition",
                    short && "border-warning/40 bg-warning/5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {line.ingredientName}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Phiếu xuất: {formatQty(line.sentQty)} {line.unit}
                    </p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span
                        className={cn(
                          "text-lg font-semibold tabular-nums",
                          short ? "text-warning" : "text-success",
                        )}
                      >
                        {formatQty(got)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {line.unit} đã nhận
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-lg"
                      className="size-10"
                      onClick={() => setEditing(line)}
                      disabled={!canAct || needsReceiveMode}
                      aria-label="Chỉnh số lượng"
                    >
                      <Pencil className="size-4" />
                    </Button>
                    {got !== line.sentQty ? (
                      <button
                        type="button"
                        className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                        onClick={() =>
                          setValues((current) => ({
                            ...current,
                            [line.ingredientId]: line.sentQty,
                          }))
                        }
                      >
                        Nhận đủ
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {hasShort && !needsReceiveMode ? (
        <Card className="gap-2 p-4">
          <label
            htmlFor="short-note"
            className="text-sm font-semibold"
          >
            Ghi chú thiếu hụt{" "}
            <span className="text-destructive">*</span>
          </label>
          <textarea
            id="short-note"
            value={shortNote}
            onChange={(e) => setShortNote(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Ví dụ: thiếu 2kg thịt ba chỉ do giao chưa đủ..."
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
          {!noteOk ? (
            <p className="text-xs text-destructive">
              Ghi chú cần ít nhất 3 ký tự.
            </p>
          ) : null}
        </Card>
      ) : null}

      {!needsReceiveMode ? (
        <label className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-3 text-sm">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(next) => setAcknowledged(next === true)}
            className="mt-0.5"
          />
          <span className="leading-snug">
            Tôi xác nhận số lượng nhận đúng với thực tế và chịu trách nhiệm về
            số liệu trên.
          </span>
        </label>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {!needsReceiveMode ? (
        <div className="sticky bottom-4 z-10">
          <TouchButton
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="shadow-lg"
          >
            {pending ? (
              <>
                <Loader2 className="size-5 animate-spin" />
                Đang xác nhận...
              </>
            ) : !canAct ? (
              "Phiếu không ở trạng thái kiểm nhận"
            ) : !acknowledged ? (
              "Tích xác nhận để gửi"
            ) : hasShort ? (
              "Xác nhận nhập thiếu"
            ) : (
              "Xác nhận đã nhận đủ"
            )}
          </TouchButton>
        </div>
      ) : null}

      <NumberPadSheet
        open={editing != null}
        onOpenChange={(next) => {
          if (!next) setEditing(null);
        }}
        title={editing ? `Nhận ${editing.ingredientName}` : ""}
        initialValue={editing ? values[editing.ingredientId] ?? 0 : 0}
        suffix={editing?.unit}
        onConfirm={(value) => {
          if (!editing) return;
          setValues((current) => ({
            ...current,
            [editing.ingredientId]: value,
          }));
          setEditing(null);
        }}
        allowDecimal
      />
    </MobilePage>
  );
}
