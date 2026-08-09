"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@comtammatu/ui/components/field";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { toast } from "@comtammatu/ui/components/sonner";
import { AppHeaderBrand } from "@/components/app-header";
import { WholeVndInput } from "@/components/form";
import { StationSection } from "@/components/surface";
import { messages } from "@lib/messages";
import { TriangleAlert as IconAlertTriangle } from "lucide-react";
import { BranchRuntimeBackControl } from "../branch-runtime-back-control";
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
   * Per-branch model: terminals only drive the "no POS terminal" block. The
   * cashier never chooses a terminal; the session belongs to the branch.
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
      // Auto-pick the first active terminal for audit metadata. The
      // per-branch model never makes the cashier choose — 1-tap UI;
      // terminal_id only records which device opened the shift. For exact
      // picking, an admin can deactivate unused pos_terminals.
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
    <div className="relative flex flex-1 flex-col overflow-y-auto p-4">
      <BranchRuntimeBackControl
        branchId={branchId}
        className="z-10 mb-3 self-start"
      />

      <div className="mx-auto flex w-full max-w-xl flex-1 items-center">
        <StationSection
          className="w-full"
          title={messages.pos.sessionGate.title}
          badge={{
            children: messages.pos.sessionGate.branch(branchId),
            variant: "outline",
          }}
          action={
            <AppHeaderBrand
              title={null}
              subtitleHiddenOnMobile={false}
              showText={false}
            />
          }
          footer={
            <Button
              className="w-full"
              size="touch-lg"
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
          }
        >
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
              <WholeVndInput
                id="opening-cash"
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
        </StationSection>
      </div>
    </div>
  );
}
