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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { BrandMark } from "@/components/brand";
import { FormattedNumberInput } from "@/components/form";
import { messages } from "@lib/messages";
import {
  TriangleAlert as IconAlertTriangle,
} from "lucide-react";
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
  /**
   * Per-branch model (Owner D7, 2026-04-27): list dùng để cảnh báo "branch
   * chưa có máy POS nào" (block mở ca). KHÔNG còn picker chọn máy — ca POS
   * giờ thuộc branch, không thuộc terminal.
   */
  terminals: PosTerminal[];
}

export function SessionGate({ branchId, terminals }: SessionGateProps) {
  const router = useRouter();
  const [openingCash, setOpeningCash] = useState<string>("0");
  const [isPending, startTransition] = useTransition();
  const cashAmount = Number(openingCash);
  const hasValidOpeningCash =
    openingCash.trim() !== "" && !Number.isNaN(cashAmount) && cashAmount >= 0;
  const branchHasTerminals = terminals.length > 0;

  const canOpen = branchHasTerminals && hasValidOpeningCash && !isPending;

  const handleOpen = useCallback(() => {
    if (!canOpen) return;

    startTransition(async () => {
      // Auto-pick first active terminal cho audit metadata. Per-branch model
      // không bắt cashier chọn — UI 1-tap, terminal_id chỉ ghi sổ "máy nào
      // physically mở ca". Nếu cashier muốn pick chính xác, admin có thể
      // edit pos_terminals list (deactivate máy không dùng).
      const firstTerminal = terminals[0];
      const result = await openPosSession(
        branchId,
        cashAmount,
        firstTerminal?.id,
      );

      if (result.success) {
        toast.success(messages.pos.sessionGate.openSuccess);
        router.refresh();
      } else {
        toast.error(result.error ?? messages.pos.sessionGate.openFailed);
      }
    });
  }, [branchId, canOpen, cashAmount, router, terminals]);

  return (
    <div className="relative flex flex-1 flex-col overflow-y-auto px-4 py-5 sm:px-6 sm:py-8">
      <EmployeePortalBackControl className="absolute left-4 top-4 z-10 sm:left-6 sm:top-6" />

      <div className="mx-auto flex w-full max-w-xl flex-1 items-center pt-12 sm:pt-0">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <Badge variant="outline" className="w-fit">
                  {messages.pos.sessionGate.branch(branchId)}
                </Badge>
                <CardTitle className="text-2xl">
                  {messages.pos.sessionGate.title}
                </CardTitle>
              </div>
              <BrandMark
                decorative
                className="size-11 shrink-0 rounded-md bg-card p-1 ring-1 ring-border"
              />
            </div>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              {!branchHasTerminals ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>
                    {messages.pos.sessionGate.noTerminalTitle}
                  </AlertTitle>
                  <AlertDescription>
                    {messages.pos.sessionGate.noTerminalDescription}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Field data-invalid={!hasValidOpeningCash}>
                <FieldLabel htmlFor="opening-cash">
                  {messages.pos.sessionGate.openingCashLabel}
                </FieldLabel>
                <FormattedNumberInput
                  id="opening-cash"
                  maxFractionDigits={0}
                  value={openingCash}
                  onValueChange={setOpeningCash}
                  placeholder="0"
                  aria-invalid={!hasValidOpeningCash}
                />
                <FieldDescription>
                  {messages.pos.sessionGate.openingCashDescription}
                </FieldDescription>
              </Field>
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
                  {messages.pos.sessionGate.opening}
                </>
              ) : (
                messages.pos.sessionGate.open
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
