"use client";

import * as React from "react";
import {
  TriangleAlert as IconAlertTriangle,
  CircleCheck as IconCircleCheck,
  ChevronRight as IconChevronRight,
  Pencil as IconPencil,
  Plus as IconPlus,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Alert, AlertDescription } from "@comtammatu/ui/components/alert";
import { Item } from "@comtammatu/ui/components/item";
import { ACTIONS_VI, STATES_VI } from "@comtammatu/shared/messages";
import {
  GrnLineEditFields,
  GrnLineEditSheet,
} from "@/(protected)/inventory/_components/grn-line-editor";
import { AppDialog } from "@/components/form/form-dialog";
import { FormField } from "@/components/form/form-field";
import {
  AppBackLink,
  AppDetailFooter,
  AppEmptyState,
  AppPageHeader,
  AppSection,
  DocumentFormFrame,
} from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import { InteractiveCard } from "@/components/data-table/interactive-card";
import { formatQty } from "@lib/inventory/format";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import type {
  GrnCreatePageData,
  GrnLineEditState,
} from "@lib/inventory/grn-create-model";
import { getGrnLocationKindLabel } from "@lib/inventory/grn-create-model";
import type { GrnDraftLine } from "@lib/inventory/grn-draft";
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

function DraftLineMobileCard({
  line,
  onEdit,
  onRemove,
}: {
  line: GrnDraftLine;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <Item variant="outline" className="items-start gap-3 px-3 py-2.5">
      <Button
        type="button"
        variant="ghost"
        onClick={onEdit}
        className="h-auto min-w-0 flex-1 justify-start px-0 py-0 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <p className="truncate text-sm font-semibold leading-tight">
            {line.ingredientName}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {line.supplierName}
          </p>
          <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
            {GRN_CREATE_COPY.lineQtyOnly(line.quantity, line.unit)}
          </p>
        </span>
      </Button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={onEdit}
          aria-label={GRN_CREATE_COPY.editLineAria}
        >
          <IconPencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={onRemove}
          aria-label={GRN_CREATE_COPY.deleteLineAria}
        >
          <IconTrash className="size-4" />
        </Button>
      </div>
    </Item>
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
  const showDeskEditor = isDesktopLineEdit && controller.edit != null;
  const showBothReceivingPickers =
    controller.showBranchPicker && controller.showLocationPicker;
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const grnCopy = messages.inventory.grn;
  const inventoryCommon = messages.inventory.common;

  function openCatalogPicker() {
    setCatalogOpen(true);
  }

  function handleCatalogOpenChange(open: boolean) {
    setCatalogOpen(open);
    if (!open) controller.setQuery("");
  }

  function pickCatalogIngredient(ingredientId: number) {
    handleCatalogOpenChange(false);
    controller.openEdit(ingredientId);
  }

  const draftLineColumns: DataTableColumn<GrnDraftLine>[] = [
    {
      key: "name",
      header: grnCopy.lineHeaderName,
      render: (line) => (
        <div className="min-w-0">
          <p className="min-w-0 truncate font-medium">{line.ingredientName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {line.supplierName}
          </p>
        </div>
      ),
    },
    {
      key: "qty",
      header: inventoryCommon.quantityShort,
      className: "w-28 text-right",
      render: (line) => (
        <span className="font-mono tabular-nums">
          {formatQty(line.quantity)} {line.unit}
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="sr-only">{GRN_CREATE_COPY.lineActionsAria}</span>
      ),
      className: "w-24 text-right",
      render: (line) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => controller.openEdit(line.ingredientId)}
            aria-label={GRN_CREATE_COPY.editLineAria}
          >
            <IconPencil className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void controller.removeLine(line.ingredientId)}
            aria-label={GRN_CREATE_COPY.deleteLineAria}
          >
            <IconTrash className="size-4" />
          </Button>
        </div>
      ),
    },
  ];

  const warehouseField = (
    <div
      className={cn(
        "grid gap-3",
        showBothReceivingPickers ? "sm:grid-cols-2" : "sm:grid-cols-1",
      )}
    >
      {controller.showBranchPicker ? (
        <FormField
          controlId={
            data.procurementBranches.length > 0
              ? "grn-receiving-branch"
              : undefined
          }
          label={
            showBothReceivingPickers
              ? GRN_CREATE_COPY.receivingBranch
              : grnCopy.receivingWarehouse
          }
          disabled={controller.submitting || controller.receivingSiteSaving}
        >
          {data.procurementBranches.length > 0 ? (
            <Select
              value={
                controller.branchId != null ? String(controller.branchId) : ""
              }
              onValueChange={controller.handleBranchChange}
              disabled={controller.submitting || controller.receivingSiteSaving}
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
            <p className="text-sm font-medium">
              {controller.selectedBranchName}
            </p>
          )}
        </FormField>
      ) : null}

      {controller.showLocationPicker ? (
        <FormField
          controlId="grn-receiving-location"
          label={GRN_CREATE_COPY.receivingLocation}
          description={
            showBothReceivingPickers
              ? GRN_CREATE_COPY.receivingLocationHint
              : undefined
          }
          disabled={controller.submitting || controller.receivingSiteSaving}
        >
          <Select
            value={
              controller.locationId != null ? String(controller.locationId) : ""
            }
            onValueChange={controller.handleLocationChange}
            disabled={controller.submitting || controller.receivingSiteSaving}
          >
            <SelectTrigger
              id="grn-receiving-location"
              size="field"
              className="w-full"
            >
              <SelectValue placeholder={GRN_CREATE_COPY.locationUnselected} />
            </SelectTrigger>
            <SelectContent>
              {controller.branchLocations.map((location) => (
                <SelectItem key={location.id} value={String(location.id)}>
                  {getGrnLocationKindLabel(location)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      ) : null}

      {controller.receivingSiteSaving ? (
        <p
          className={cn(
            "text-xs text-muted-foreground",
            showBothReceivingPickers && "sm:col-span-2",
          )}
        >
          {GRN_CREATE_COPY.receivingLocationSaving}
        </p>
      ) : null}
    </div>
  );

  const contextStrip = (
    <div className="flex flex-col gap-3">
      <p className="min-w-0 text-sm">
        <span className="text-muted-foreground">
          {GRN_CREATE_COPY.supplierLabel}{" "}
        </span>
        <span className="font-semibold text-foreground">
          {controller.supplierSummary}
        </span>
      </p>
      {controller.showWarehouseEditor ? (
        warehouseField
      ) : (
        <p className="min-w-0 text-sm">
          <span className="text-muted-foreground">
            {grnCopy.receivingWarehouse}{" "}
          </span>
          <span className="font-semibold text-foreground">
            {controller.selectedBranchName} · {controller.selectedLocationName}
          </span>
        </p>
      )}
    </div>
  );

  const draftLinesSection = (
    <AppSection
      size="sm"
      title={GRN_CREATE_COPY.draftLinesTitle}
      contentClassName="gap-2"
      action={
        <Button
          type="button"
          variant="outline"
          size="touch"
          onClick={openCatalogPicker}
          disabled={controller.submitting}
        >
          <IconPlus className="size-4" />
          {GRN_CREATE_COPY.addItem}
        </Button>
      }
    >
      {controller.lineCount === 0 ? (
        <AppEmptyState
          compact
          icon={<IconSearch />}
          title={GRN_CREATE_COPY.draftEmptyTitle}
          description={GRN_CREATE_COPY.draftEmptyDescription}
        />
      ) : (
        <DataTable
          columns={draftLineColumns}
          data={controller.draft.lines}
          getRowKey={(line) => line.ingredientId}
          onRowClick={(line) => controller.openEdit(line.ingredientId)}
          emptyTitle={GRN_CREATE_COPY.draftEmptyTitle}
          emptyDescription={GRN_CREATE_COPY.draftEmptyDescription}
          mobileCardRender={(line) => (
            <DraftLineMobileCard
              line={line}
              onEdit={() => controller.openEdit(line.ingredientId)}
              onRemove={() => void controller.removeLine(line.ingredientId)}
            />
          )}
        />
      )}
    </AppSection>
  );

  const catalogPickerDialog = (
    <AppDialog
      open={catalogOpen}
      onOpenChange={handleCatalogOpenChange}
      title={GRN_CREATE_COPY.catalogTitle}
      contentClassName="sm:max-w-lg"
      bodyClassName="gap-3"
    >
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
          autoFocus
        />
      </InputGroup>

      <div className="flex max-h-[min(28rem,55dvh)] flex-col gap-2 overflow-y-auto">
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
            return (
              <InteractiveCard
                key={ingredient.id}
                padding="compact"
                minHeight="tap"
                className="rounded-lg"
                render={
                  <button
                    type="button"
                    onClick={() => pickCatalogIngredient(ingredient.id)}
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
                    {ingredient.unit}
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
    </AppDialog>
  );

  const header = (
    <AppPageHeader
      breadcrumb={
        <AppBackLink href={basePath}>
          {GRN_CREATE_COPY.backToList}
        </AppBackLink>
      }
      eyebrow={GRN_CREATE_COPY.newReceiptEyebrow}
      title={GRN_CREATE_COPY.newReceiptTitle}
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
      <div className="flex min-w-0 flex-col gap-3">
        {contextStrip}

        <div
          className={cn(
            // pb-24 clears sticky AppDetailFooter; desk editor max-h stays above it.
            "flex min-w-0 flex-col gap-3 pb-24",
            showDeskEditor &&
              "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:items-start lg:gap-4",
          )}
        >
          <div className="flex min-w-0 flex-col gap-3">
            {draftLinesSection}
            {controller.submitError ? (
              <Alert variant="destructive">
                <IconAlertTriangle className="size-4" />
                <AlertDescription>{controller.submitError}</AlertDescription>
              </Alert>
            ) : null}
          </div>

          {showDeskEditor && controller.edit ? (
            <aside className="hidden lg:sticky lg:top-3 lg:z-0 lg:flex lg:max-h-[calc(100dvh-8.5rem)] lg:flex-col lg:overflow-hidden">
              <LineEditPanel
                edit={controller.edit}
                onClose={controller.closeEdit}
                onSave={controller.saveLine}
                onRemove={() => {
                  void controller.removeLine(controller.edit!.ingredient.id);
                  controller.closeEdit();
                }}
                onPatch={controller.patchEdit}
                onUnitChange={controller.updateEditUnit}
              />
            </aside>
          ) : null}
        </div>
      </div>

      {catalogPickerDialog}

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
      sticky
      leading={
        controller.lineCount > 0 ? (
          <p className="min-w-0 font-mono text-sm font-semibold tabular-nums">
            {GRN_CREATE_COPY.footerLineSummary(controller.lineCount)}
          </p>
        ) : undefined
      }
      trailing={
        <Button
          type="button"
          size="touch-lg"
          className="sm:min-w-80"
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
      }
    />
  );

  return (
    <DocumentFormFrame
      header={header}
      width="wide"
      density="compact"
      footer={footer}
    >
      {body}
    </DocumentFormFrame>
  );
}

type LineEditPanelProps = {
  edit: GrnLineEditState;
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
  const valid = edit.quantity > 0 && edit.supplierId != null;

  return (
    <AppSection
      size="sm"
      title={edit.ingredient.name}
      description={edit.ingredient.sku || undefined}
      className="flex min-h-0 max-h-full flex-col overflow-hidden"
      contentClassName="min-h-0 flex-1 gap-3 overflow-y-auto"
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button
            type="button"
            className="w-full"
            onClick={onSave}
            disabled={!valid}
          >
            {edit.line
              ? GRN_CREATE_COPY.updateLineOnReceipt
              : GRN_CREATE_COPY.addLineToReceipt}
          </Button>
          <div className="flex items-center gap-2">
            {edit.line ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onRemove}
                className="flex-1"
              >
                {ACTIONS_VI.delete}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
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
