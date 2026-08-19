"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { AppEmptyState } from "@/components/surface";
import { FormField } from "@/components/form/form-field";
import { messages } from "@lib/messages";
import {
  formatTransferLocationLabel,
  formatTransferTargetOption,
} from "./transfer-create-model";
import type {
  TransferCreateDirection,
  useTransferCreateController,
} from "./use-transfer-create-controller";

type TransferCreateController = ReturnType<typeof useTransferCreateController>;

export function TransferCreateRouteFields({
  controller,
  controlSize,
  optionSize,
}: {
  controller: TransferCreateController;
  controlSize: "touch" | "field";
  optionSize: "touch" | "default";
}) {
  const copy = messages.inventory.transfer;
  const showDirectionToggle =
    controller.canCreatePull && controller.canCreateOutbound;
  const sourceBranch = controller.selectedSourceBranch;
  const canCreate = controller.canCreatePull || controller.canCreateOutbound;

  if (!canCreate) {
    return (
      <AppEmptyState
        compact
        title={copy.createUnavailableTitle}
        description={copy.createForbidden}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showDirectionToggle ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{copy.directionLabel}</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size={controlSize === "touch" ? "touch" : "default"}
            value={controller.direction}
            onValueChange={(value) => {
              if (value !== "pull" && value !== "outbound") return;
              controller.setDirection(value as TransferCreateDirection);
            }}
            aria-label={copy.directionLabel}
            className="w-full"
          >
            <ToggleGroupItem value="pull" className="min-w-0 flex-1">
              {copy.pullAction}
            </ToggleGroupItem>
            <ToggleGroupItem value="outbound" className="min-w-0 flex-1">
              {copy.outboundAction}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      {controller.isPull ? (
        <>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {copy.pullFromLabel}
              <span aria-hidden="true"> *</span>
            </span>
            <Select
              value={controller.pullFromBranchId}
              onValueChange={controller.setPullFromBranchId}
            >
              <SelectTrigger
                size={controlSize}
                className="w-full"
                aria-required
                aria-label={copy.pullFromLabel}
              >
                <SelectValue placeholder={copy.chooseSourceError} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {controller.pullSourceOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      size={optionSize}
                    >
                      {formatTransferTargetOption(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {copy.targetBranchLabel}
            </span>
            <span className="font-semibold">
              {controller.myBranchName ?? copy.outboundFromSelected}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">
              {copy.sourceBranchLabel}
            </span>
            <span className="font-semibold">
              {controller.myBranchName ?? copy.outboundFromSelected}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              {copy.targetBranchLabel}
              <span aria-hidden="true"> *</span>
            </span>
            <Select
              value={controller.outboundToBranchId}
              onValueChange={controller.setOutboundToBranchId}
            >
              <SelectTrigger
                size={controlSize}
                className="w-full"
                aria-required
                aria-label={copy.targetBranchLabel}
              >
                <SelectValue placeholder={copy.chooseReceivingWarehouse} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {controller.outboundDestinationOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      size={optionSize}
                    >
                      {formatTransferTargetOption(option)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      {controller.outboundSourceLocationOptions.length > 1 && sourceBranch ? (
        <FormField
          controlId="owner-transfer-source-location"
          label={copy.sourceLocationRequired}
          required
        >
          <Select
            value={controller.outboundSourceLocationId}
            onValueChange={controller.handleOutboundSourceLocationChange}
          >
            <SelectTrigger
              id="owner-transfer-source-location"
              size={controlSize}
              className="w-full"
              aria-required
            >
              <SelectValue placeholder={copy.chooseSourceLocation} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {controller.outboundSourceLocationOptions.map((location) => (
                  <SelectItem
                    key={location.id}
                    value={String(location.id)}
                    size={optionSize}
                  >
                    {formatTransferLocationLabel(sourceBranch, location.kind)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </FormField>
      ) : null}
    </div>
  );
}
