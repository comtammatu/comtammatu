"use client";

import * as React from "react";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
  Pencil as IconPencil,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import {
  GrnLineEditFields,
  GrnLineEditSheet,
} from "@/(protected)/inventory/_components/grn-line-editor";
import { FormField } from "@/components/form/form-field";
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { getDisplayReferenceCost } from "@lib/inventory/reference-cost";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import type {
  GrnCreatePageData,
  GrnLineEditState,
} from "@lib/inventory/grn-create-model";
import { useGrnCreateController } from "@lib/inventory/use-grn-create-controller";
import { messages } from "@lib/messages";

type GrnCreateClientProps = GrnCreatePageData & {
  basePath?: string;
  grnBasePath?: string;
};

let deskLineEditMql: MediaQueryList | null = null;

function getDeskLineEditQuery(): MediaQueryList {
  deskLineEditMql ??= window.matchMedia("(min-width: 1024px)");
  return deskLineEditMql;
}

function subscribeDeskLineEdit(onStoreChange: () => void): () => void {
  const list = getDeskLineEditQuery();
  list.addEventListener("change", onStoreChange);
  return () => list.removeEventListener("change", onStoreChange);
}

function getDeskLineEditSnapshot(): boolean {
  return getDeskLineEditQuery().matches;
}

function getDeskLineEditServerSnapshot(): boolean {
  return false;
}

function useIsDesktopLineEdit(): boolean {
  return React.useSyncExternalStore(
    subscribeDeskLineEdit,
    getDeskLineEditSnapshot,
    getDeskLineEditServerSnapshot,
  );
}

export function GrnCreateClient({
  basePath = "/inventory/grn/new",
  grnBasePath = "/inventory/grn",
  ...data
}: GrnCreateClientProps) {
  const controller = useGrnCreateController({
    ...data,
    basePath,
    grnBasePath,
  });
  const isDesktopLineEdit = useIsDesktopLineEdit();

  const warehouseField = (
    <div className="grid gap-3">
      <FormField
        controlId={
          data.procurementBranches.length > 0
            ? "grn-receiving-branch"
            : undefined
        }
        label={messages.inventory.grn.receivingWarehouse}
        disabled={
          !controller.showBranchPicker ||
          controller.submitting ||
          controller.receivingSiteSaving
        }
      >
        {data.procurementBranches.length > 0 ? (
          <Select
            value={
              controller.branchId != null ? String(controller.branchId) : ""
            }
            onValueChange={controller.handleBranchChange}
            disabled={
              !controller.showBranchPicker ||
              controller.submitting ||
              controller.receivingSiteSaving
            }
          >
            <SelectTrigger
              id="grn-receiving-branch"
              size="field"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.procurementBranches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium">{controller.selectedBranchName}</p>
        )}
      </FormField>
      <FormField
        controlId={
          controller.branchLocations.length > 0
            ? "grn-receiving-location"
            : undefined
        }
        label={GRN_CREATE_COPY.receivingLocation}
        disabled={
          !controller.showLocationPicker ||
          controller.submitting ||
          controller.receivingSiteSaving
        }
      >
        {controller.branchLocations.length > 0 ? (
          <Select
            value={
              controller.locationId != null ? String(controller.locationId) : ""
            }
            onValueChange={controller.handleLocationChange}
            disabled={
              !controller.showLocationPicker ||
              controller.submitting ||
              controller.receivingSiteSaving
            }
          >
            <SelectTrigger
              id="grn-receiving-location"
              size="field"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {controller.branchLocations.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {location.branchName} · {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm font-medium">
            {GRN_CREATE_COPY.locationUnselected}
          </p>
        )}
      </FormField>
    </div>
  );

  const documentSummary = (
    <AppSection size="sm" title={messages.inventory.grn.documentLabel}>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-muted/50 px-3 py-2">
          <SectionLabel density="dense">
            {messages.inventory.grn.supplier}
          </SectionLabel>
          <p className="truncate text-sm font-semibold">
            {controller.supplier.name}
          </p>
        </div>
        {controller.showWarehouseEditor ? (
          <Frame className="p-3 sm:col-span-2">
            {warehouseField}
            {controller.receivingSiteSaving ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {GRN_CREATE_COPY.receivingLocationSaving}
              </p>
            ) : null}
          </Frame>
        ) : (
          <div className="rounded-md bg-muted/50 px-3 py-2">
            <SectionLabel density="dense">
              {GRN_CREATE_COPY.receivingLocation}
            </SectionLabel>
            <p className="truncate text-sm font-semibold">
              {controller.selectedBranchName} ·{" "}
              {controller.selectedLocationName}
            </p>
          </div>
        )}
      </div>
    </AppSection>
  );

  const listColumn = (
    <>
      {documentSummary}
      {controller.lineCount > 0 ? (
        <AppSection size="sm" contentClassName="gap-2">
          <div className="flex items-center justify-between text-2xs font-medium uppercase tracking-wider text-muted-foreground">
            <span>{GRN_CREATE_COPY.addedSummary(controller.lineCount)}</span>
            <span className="text-foreground">
              {GRN_CREATE_COPY.priceOnPoShort}
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {controller.draft.lines.map((line) => (
              <div
                key={line.ingredientId}
                className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {line.ingredientName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {GRN_CREATE_COPY.lineQtyOnly(line.quantity, line.unit)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    onClick={() => controller.openEdit(line.ingredientId)}
                    aria-label={GRN_CREATE_COPY.editLineAria}
                  >
                    <IconPencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => controller.removeLine(line.ingredientId)}
                    aria-label={GRN_CREATE_COPY.deleteLineAria}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </AppSection>
      ) : null}

      <InputGroup className="h-12 rounded-lg">
        <InputGroupAddon>
          <IconSearch />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          aria-label={GRN_CREATE_COPY.searchPlaceholder}
          value={controller.query}
          onChange={(event) => controller.setQuery(event.target.value)}
          placeholder={GRN_CREATE_COPY.searchPlaceholder}
          className="text-base"
          inputMode="search"
        />
      </InputGroup>

      <div className="flex flex-col gap-2">
        {controller.filtered.length === 0 ? (
          <AppEmptyState
            compact
            icon={<IconSearch />}
            title={
              data.ingredients.length === 0
                ? GRN_CREATE_COPY.emptySupplierTitle
                : GRN_CREATE_COPY.emptyTitle
            }
            description={
              data.ingredients.length === 0
                ? GRN_CREATE_COPY.emptySupplierDescription
                : GRN_CREATE_COPY.emptyDescription
            }
          />
        ) : (
          controller.filtered.map((ingredient) => {
            const added = controller.addedMap.has(ingredient.id);
            const referenceCost = getDisplayReferenceCost(ingredient);
            return (
              <InteractiveCard
                key={ingredient.id}
                padding="compact"
                minHeight="tap"
                className="rounded-lg"
                render={
                  <button
                    type="button"
                    onClick={() => controller.openEdit(ingredient.id)}
                    className="w-full text-left"
                  />
                }
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-2xs font-bold uppercase text-muted-foreground">
                  {(ingredient.sku ?? ingredient.name).slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">
                    {ingredient.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ingredient.sku ? `${ingredient.sku} · ` : ""}
                    {referenceCost?.unit || ingredient.unit}
                    {referenceCost
                      ? ` · ~${GRN_CREATE_COPY.lastCost(
                          referenceCost.value,
                          referenceCost.unit,
                        )}`
                      : ""}
                  </p>
                </div>
                {added ? (
                  <IconCircleCheck className="size-5 shrink-0 text-success" />
                ) : (
                  <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </InteractiveCard>
            );
          })
        )}
      </div>

      {controller.submitError ? (
        <Alert variant="destructive">
          <IconAlertTriangle className="size-4" />
          <AlertDescription>{controller.submitError}</AlertDescription>
        </Alert>
      ) : null}
    </>
  );

  const header = (
    <AppPageHeader
      breadcrumb={
        <AppBackLink href={basePath}>
          {GRN_CREATE_COPY.changeSupplier}
        </AppBackLink>
      }
      eyebrow={GRN_CREATE_COPY.newReceiptEyebrow}
      title={controller.supplier.name}
      description={GRN_CREATE_COPY.newReceiptDescription}
      actions={
        controller.lineCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="touch"
            className="gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={controller.discardDraft}
          >
            <IconTrash className="size-4" />
            {GRN_CREATE_COPY.discardDraft}
          </Button>
        ) : undefined
      }
    />
  );

  const body = (
    <>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-3">{listColumn}</div>
        <div className="hidden lg:block">
          <LineEditPanel
            edit={controller.edit}
            onClose={controller.closeEdit}
            onSave={controller.saveLine}
            onRemove={() => {
              if (!controller.edit) return;
              void controller.removeLine(controller.edit.ingredient.id);
              controller.closeEdit();
            }}
            onPatch={controller.patchEdit}
            onUnitChange={controller.updateEditUnit}
          />
        </div>
      </div>

      <GrnLineEditSheet
        edit={isDesktopLineEdit ? null : controller.edit}
        onClose={controller.closeEdit}
        onSave={controller.saveLine}
        onRemove={() => {
          if (!controller.edit) return;
          void controller.removeLine(controller.edit.ingredient.id);
          controller.closeEdit();
        }}
        onPatch={controller.patchEdit}
        onUnitChange={controller.updateEditUnit}
        controlSize="field"
      />
    </>
  );

  const footer = (
    <AppDetailFooter
      className="border-0 p-0 shadow-none"
      trailing={
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80">
          <Button
            type="button"
            size="touch-lg"
            onClick={controller.submit}
            disabled={!controller.canSubmit}
          >
            {controller.submitting ? (
              <>
                <Spinner className="size-5" />
                {STATES_VI.saving}
              </>
            ) : controller.lineCount === 0 ? (
              GRN_CREATE_COPY.addItemToContinue
            ) : (
              GRN_CREATE_COPY.reviewBeforeConfirm(controller.lineCount)
            )}
          </Button>
        </div>
      }
    />
  );

  return (
    <DocumentFormFrame header={header} width="wide" footer={footer}>
      {body}
    </DocumentFormFrame>
  );
}

type LineEditPanelProps = {
  edit: GrnLineEditState | null;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
  onPatch: (patch: Partial<GrnLineEditState>) => void;
  onUnitChange: (unitId: number, label: string) => void;
};

function LineEditPanel({
  edit,
  onClose,
  onSave,
  onRemove,
  onPatch,
  onUnitChange,
}: LineEditPanelProps) {
  const valid = edit != null && edit.quantity > 0;

  if (!edit) {
    return (
      <AppSection contentClassName="items-center justify-center py-10 text-center">
        <p className="text-sm font-medium text-muted-foreground">
          {GRN_CREATE_COPY.panelEmptyTitle}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {GRN_CREATE_COPY.panelEmptyDescription}
        </p>
      </AppSection>
    );
  }

  return (
    <AppSection
      title={edit.ingredient.name}
      description={
        edit.ingredient.sku
          ? `${edit.ingredient.sku} · ${GRN_CREATE_COPY.unitLabel(edit.unit)}`
          : GRN_CREATE_COPY.unitLabel(edit.unit)
      }
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={onSave}
            disabled={!valid}
          >
            {edit.line ? "Cập nhật" : "Thêm vào phiếu"}
          </Button>
          <div className="flex items-center gap-2">
            {edit.line ? (
              <Button
                type="button"
                variant="destructive"
                onClick={onRemove}
                className="flex-1"
              >
                {ACTIONS_VI.delete}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              {ACTIONS_VI.close}
            </Button>
          </div>
        </div>
      }
    >
      <GrnLineEditFields
        edit={edit}
        onPatch={onPatch}
        onUnitChange={onUnitChange}
        controlSize="field"
      />
    </AppSection>
  );
}
