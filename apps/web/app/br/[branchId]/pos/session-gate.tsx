"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { IconDeviceDesktop, IconAlertTriangle, IconWallet } from "@tabler/icons-react";
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
  const hasValidOpeningCash =
    openingCash.trim() !== "" && !Number.isNaN(cashAmount) && cashAmount >= 0;

  const canOpen =
    terminalId !== "" &&
    hasValidOpeningCash &&
    !selectedTerminalOccupied &&
    !isPending;

  const statusText = canOpen
    ? "Có thể mở ca ngay"
    : selectedTerminalOccupied
      ? "Máy POS đang bận"
      : terminalId === ""
        ? "Chọn máy POS để tiếp tục"
        : "Kiểm tra tiền đầu ca";

  const handleOpen = useCallback(() => {
    if (!canOpen) return;

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
  }, [branchId, canOpen, cashAmount, router, terminalId]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
      <EmployeePortalBackControl className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6" />

      <div className="mx-auto flex w-full max-w-xl flex-1 items-center pt-12 sm:pt-0">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Badge variant="outline" className="w-fit">
                  Chi nhánh #{branchId}
                </Badge>
                <CardTitle className="text-2xl">Mở ca bán hàng</CardTitle>
                <CardDescription>
                  Chọn máy POS và nhập tiền đầu ca để bắt đầu nhận đơn.
                </CardDescription>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <IconDeviceDesktop className="size-5" />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="terminal">Máy POS</FieldLabel>
                {terminals.length === 0 ? (
                  <Alert className="border-warning/20 bg-warning/10 text-warning">
                    <IconAlertTriangle />
                    <AlertTitle>Chưa có máy POS</AlertTitle>
                    <AlertDescription>
                      Liên hệ quản lý để thiết lập máy POS trước khi mở ca.
                    </AlertDescription>
                  </Alert>
                ) : availableTerminalCount === 0 ? (
                  <Alert className="border-warning/20 bg-warning/10 text-warning">
                    <IconAlertTriangle />
                    <AlertTitle>Tất cả máy đang có ca mở</AlertTitle>
                    <AlertDescription>
                      Đóng ca trên một máy POS hoặc chọn ca khác trước khi tiếp
                      tục.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Select value={terminalId} onValueChange={setTerminalId}>
                    <SelectTrigger id="terminal">
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
                            ? `${terminal.name} - đang có ca mở`
                            : terminal.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <FieldDescription>
                  Máy POS chỉ được có một ca đang mở tại một thời điểm.
                </FieldDescription>
              </Field>

              {selectedTerminalOccupied ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>Máy POS đang bận</AlertTitle>
                  <AlertDescription>
                    Chọn máy khác hoặc đóng ca hiện tại trước khi tiếp tục.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Field data-invalid={!hasValidOpeningCash}>
                <FieldLabel htmlFor="opening-cash">
                  Tiền đầu ca (VND)
                </FieldLabel>
                <Input
                  id="opening-cash"
                  type="number"
                  min="0"
                  step="1000"
                  value={openingCash}
                  onChange={(event) => setOpeningCash(event.target.value)}
                  placeholder="0"
                  aria-invalid={!hasValidOpeningCash}
                />
                <FieldDescription>
                  Ghi số tiền mặt đầu ca để đối soát khi đóng ca.
                </FieldDescription>
              </Field>

              <div className="rounded-lg border bg-muted/35 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Trạng thái
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {statusText}
                    </p>
                  </div>
                  <IconWallet className="size-4 shrink-0 text-muted-foreground" />
                </div>
              </div>
            </FieldGroup>
          </CardContent>

          <CardFooter>
            <Button
              className="w-full"
              size="lg"
              disabled={!canOpen}
              onClick={handleOpen}
            >
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Đang mở ca...
                </>
              ) : (
                "Mở ca"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
