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
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { FormattedNumberInput } from "@/components/form";
import {
  Monitor as IconDeviceDesktop,
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
        toast.success("Mở ca thành công");
        router.refresh();
      } else {
        toast.error(result.error ?? "Không thể mở ca");
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
                  Chi nhánh #{branchId}
                </Badge>
                <CardTitle className="text-2xl">Mở ca bán hàng</CardTitle>
                <CardDescription>
                  Nhập tiền đầu ca để bắt đầu nhận đơn. Chi nhánh chỉ có 1 ca
                  POS hoạt động cùng lúc — các nhân viên khác cùng chi nhánh
                  sẽ tự động bán trên ca này.
                </CardDescription>
              </div>
              <div className="flex size-11 shrink-0 items-center justify-center bg-primary/10 text-primary">
                <IconDeviceDesktop className="size-5" />
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <FieldGroup>
              {!branchHasTerminals ? (
                <Alert className="border-warning/20 bg-warning/10 text-warning">
                  <IconAlertTriangle />
                  <AlertTitle>Chưa có máy POS</AlertTitle>
                  <AlertDescription>
                    Liên hệ quản lý để thiết lập máy POS trước khi mở ca.
                  </AlertDescription>
                </Alert>
              ) : null}

              <Field data-invalid={!hasValidOpeningCash}>
                <FieldLabel htmlFor="opening-cash">
                  Tiền đầu ca (VND)
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
                  Ghi số tiền mặt đầu ca để đối soát khi đóng ca.
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
                  Đang mở ca...
                </>
              ) : (
                "Mở ca POS"
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
