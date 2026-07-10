"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  FileText as IconFileText,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Button } from "@comtammatu/ui/components/button";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { Combobox, FormField } from "@/components/form";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { createSupplierReturnFromGrn } from "@/(protected)/inventory/supplier-return-actions";
import {
  BRANCH_SUPPLIER_RETURN_REASONS,
  BRANCH_SUPPLIER_RETURN_RESOLUTIONS,
  type BranchReturnableGrn,
  type BranchSupplierReturnReason,
  type BranchSupplierReturnResolution,
} from "@lib/inventory/supplier-return-model";
import { messages } from "@lib/messages";

const copy = messages.inventory.supplierReturns;
const createCopy = copy.create;

export function BranchSupplierReturnCreateClient({
  branchId,
  branchName,
  returnableGrns,
}: {
  branchId: number;
  branchName: string;
  returnableGrns: BranchReturnableGrn[];
}) {
  const stockBasePath = `/br/${branchId}/stock`;
  const returnsBasePath = `${stockBasePath}/supplier-returns`;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [grnId, setGrnId] = useState("");
  const [resolution, setResolution] =
    useState<BranchSupplierReturnResolution>("credit_note");
  const [reason, setReason] = useState<BranchSupplierReturnReason>("damaged");
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const grnOptions = useMemo(
    () =>
      returnableGrns.map((grn) => ({
        value: String(grn.id),
        label: `${grn.code} · ${grn.supplierName} · ${createCopy.grnRejectedLines(grn.rejectedLines)}`,
      })),
    [returnableGrns],
  );

  function resolutionLabel(value: BranchSupplierReturnResolution) {
    return copy.resolutionLabels[value];
  }

  function reasonLabel(value: BranchSupplierReturnReason) {
    return copy.reasonLabels[value];
  }

  function handleCreate() {
    if (!grnId) {
      setSubmitError(createCopy.submitDisabledGrn);
      return;
    }

    startTransition(async () => {
      setSubmitError(null);
      const result = await createSupplierReturnFromGrn({
        grnId: Number(grnId),
        resolution,
        reason,
        notes: notes.trim() || undefined,
      });
      if (!result.success) {
        const message = result.error ?? createCopy.createFailed;
        setSubmitError(message);
        toast.error(message);
        return;
      }

      toast.success(createCopy.createdOk);
      const returnId = result.data?.id;
      router.replace(
        returnId != null ? `${returnsBasePath}/${returnId}` : returnsBasePath,
      );
      router.refresh();
    });
  }

  return (
    <BranchOperatorPage
      title={createCopy.title}
      description={branchName}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3 pb-28">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            asChild
            variant="ghost"
            size="icon-touch"
            title={ACTIONS_VI.back}
          >
            <Link href={returnsBasePath} aria-label={ACTIONS_VI.back}>
              <IconArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{createCopy.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {branchName}
            </p>
          </div>
        </BranchOperatorControlBar>

        <BranchOperatorPanel
          title={createCopy.grnPickerLabel}
          description={createCopy.description}
          icon={IconFileText}
          size="sm"
          contentClassName="gap-3"
        >
          {returnableGrns.length === 0 ? (
            <AppEmptyState
              compact
              mode="no-data"
              icon={<IconFileText />}
              title={createCopy.grnPickerEmpty}
              description={createCopy.grnAutoLinesHint}
            />
          ) : (
            <>
              <FormField
                controlId="branch-supplier-return-grn"
                label={createCopy.grnPickerLabel}
                description={
                  grnId === "" ? createCopy.submitDisabledGrn : undefined
                }
                required
              >
                <Combobox
                  id="branch-supplier-return-grn"
                  size="touch"
                  options={grnOptions}
                  value={grnId}
                  onValueChange={(value) => {
                    setGrnId(value);
                    setSubmitError(null);
                  }}
                  placeholder={createCopy.grnPickerPlaceholder}
                  searchPlaceholder={createCopy.grnPickerSearch}
                  emptyMessage={createCopy.grnPickerEmpty}
                  aria-required
                />
              </FormField>

              <NoteCallout tone="muted">
                {createCopy.grnAutoLinesHint}
              </NoteCallout>

              <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                <FormField
                  controlId="branch-supplier-return-resolution"
                  label={createCopy.resolutionLabel}
                >
                  <Select
                    value={resolution}
                    onValueChange={(value) =>
                      setResolution(value as BranchSupplierReturnResolution)
                    }
                  >
                    <SelectTrigger
                      id="branch-supplier-return-resolution"
                      size="touch"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRANCH_SUPPLIER_RETURN_RESOLUTIONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {resolutionLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                <FormField
                  controlId="branch-supplier-return-reason"
                  label={createCopy.reasonLabel}
                >
                  <Select
                    value={reason}
                    onValueChange={(value) =>
                      setReason(value as BranchSupplierReturnReason)
                    }
                  >
                    <SelectTrigger
                      id="branch-supplier-return-reason"
                      size="touch"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BRANCH_SUPPLIER_RETURN_REASONS.map((value) => (
                        <SelectItem key={value} value={value}>
                          {reasonLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              </div>

              <FormField
                controlId="branch-supplier-return-notes"
                label={createCopy.notesLabel}
              >
                <Textarea
                  id="branch-supplier-return-notes"
                  rows={3}
                  maxLength={500}
                  value={notes}
                  placeholder={createCopy.notesPlaceholder}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </FormField>

              {submitError ? (
                <Alert variant="destructive">
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              ) : null}
            </>
          )}
        </BranchOperatorPanel>

        {returnableGrns.length > 0 ? (
          <AppDetailFooter
            sticky
            trailing={
              <Button
                type="button"
                size="touch-lg"
                disabled={isPending || grnId === ""}
                onClick={handleCreate}
              >
                {isPending ? <Spinner className="size-5" /> : null}
                {grnId === ""
                  ? createCopy.submitDisabledGrn
                  : createCopy.submitFromGrn}
              </Button>
            }
          />
        ) : null}
      </div>
    </BranchOperatorPage>
  );
}
