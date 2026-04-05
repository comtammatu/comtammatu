"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Loader2, Monitor } from "lucide-react";
import { openPosSession } from "./actions";

interface PosTerminal {
  id: number;
  name: string;
  device_id: string | null;
}

interface SessionGateProps {
  branchId: number;
  terminals: PosTerminal[];
}

export function SessionGate({ branchId, terminals }: SessionGateProps) {
  const router = useRouter();
  const [terminalId, setTerminalId] = useState<string>("");
  const [openingCash, setOpeningCash] = useState<string>("0");
  const [isPending, startTransition] = useTransition();

  const canOpen = terminalId !== "" && !isPending;

  const handleOpen = useCallback(() => {
    if (!canOpen) return;

    startTransition(async () => {
      const result = await openPosSession(
        branchId,
        Number(terminalId),
        Number(openingCash) || 0,
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
    <div className="flex flex-1 items-center justify-center bg-muted/30">
      <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-primary/10">
            <Monitor className="size-6 text-primary" />
          </div>
          <h1 className="text-lg font-bold">Mở ca bán hàng</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chọn máy POS và nhập tiền đầu ca
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="terminal">Máy POS</Label>
            {terminals.length === 0 ? (
              <p className="text-sm text-destructive">
                Chưa có máy POS nào. Liên hệ quản lý để thiết lập.
              </p>
            ) : (
              <Select value={terminalId} onValueChange={setTerminalId}>
                <SelectTrigger id="terminal">
                  <SelectValue placeholder="Chọn máy POS" />
                </SelectTrigger>
                <SelectContent>
                  {terminals.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="opening-cash">Tiền đầu ca (VNĐ)</Label>
            <Input
              id="opening-cash"
              type="number"
              min="0"
              step="1000"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0"
            />
          </div>

          <Button
            className="mt-2 w-full"
            size="lg"
            disabled={!canOpen}
            onClick={handleOpen}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Đang mở ca...
              </>
            ) : (
              "Mở ca"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
