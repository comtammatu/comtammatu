"use client";

import { useState } from "react";
import {
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
  Search as IconSearch,
  Trash as IconTrash,
} from "lucide-react";
import { STATES_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { Label } from "@comtammatu/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { BranchGrnCreateLineSheet } from "@/(protected)/br/[branchId]/(operator)/stock/grn/_components/grn-line-sheet";
import { AppDetailFooter, AppEmptyState } from "@/components/surface";
import {
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  getGrnLocationKindLabel,
  type GrnCreatePageData,
} from "@lib/inventory/grn-create-model";
import { useGrnCreateController } from "@lib/inventory/use-grn-create-controller";

interface BranchGrnCreateClientProps extends GrnCreatePageData {
  sourceBasePath: string;
  backHref: string;
  grnBasePath: string;
  returnTo: string;
}

export function BranchGrnCreateClient({
  sourceBasePath,
  backHref,
  grnBasePath,
  returnTo,
  ...data
}: BranchGrnCreateClientProps) {
  const controller = useGrnCreateController({
    ...data,
    basePath: sourceBasePath,
    grnBasePath,
    returnTo,
  });
  const [showPicker, setShowPicker] = useState(false);
  const pickerVisible = controller.lineCount === 0 || showPicker;

  return (
    <BranchOperatorPage
      title={GRN_CREATE_COPY.newReceiptEyebrow}
      description={`${controller.supplier.name} · ${controller.selectedBranchName}`}
      backHref={backHref}
      backLabel={GRN_CREATE_COPY.changeSupplier}
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        {controller.showWarehouseEditor ? (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="branch-grn-receiving-location">
              {GRN_CREATE_COPY.receivingLocation}
            </Label>
            <Select
              value={
                controller.locationId != null
                  ? String(controller.locationId)
                  : ""
              }
              onValueChange={controller.handleLocationChange}
              disabled={controller.submitting || controller.receivingSiteSaving}
            >
              <SelectTrigger
                id="branch-grn-receiving-location"
                size="touch"
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
            {controller.receivingSiteSaving ? (
              <p className="text-xs text-muted-foreground">
                {GRN_CREATE_COPY.receivingLocationSaving}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="min-w-0">
          {pickerVisible ? (
            <BranchOperatorPanel
              size="sm"
              title={GRN_CREATE_COPY.addItem}
              contentClassName="gap-3"
            >
              <InputGroup className="h-12">
                <InputGroupAddon>
                  <IconSearch />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  value={controller.query}
                  onChange={(event) => controller.setQuery(event.target.value)}
                  placeholder={GRN_CREATE_COPY.searchPlaceholder}
                  className="text-base"
                  inputMode="search"
                />
              </InputGroup>

              {!controller.query.trim() ? (
                <p className="text-sm text-muted-foreground">
                  {GRN_CREATE_COPY.searchHint}
                </p>
              ) : controller.filtered.length === 0 ? (
                <AppEmptyState
                  compact
                  mode="no-results"
                  icon={<IconSearch />}
                  title={GRN_CREATE_COPY.emptyTitle}
                  description={GRN_CREATE_COPY.emptyDescription}
                />
              ) : (
                <ItemGroup className="gap-2" role="list">
                  {controller.filtered.map((ingredient) => {
                    const added = controller.addedMap.has(ingredient.id);
                    return (
                      <div key={ingredient.id} role="listitem">
                        <Item
                          asChild
                          variant="outline"
                          className="min-h-16 touch-manipulation"
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => controller.openEdit(ingredient.id)}
                          >
                            <ItemContent className="min-w-0 gap-1">
                              <ItemTitle className="line-clamp-none text-sm font-semibold">
                                {ingredient.name}
                              </ItemTitle>
                              <ItemDescription className="line-clamp-none text-xs">
                                {ingredient.sku ? `${ingredient.sku} · ` : ""}
                                {ingredient.unit}
                              </ItemDescription>
                            </ItemContent>
                            <ItemActions className="shrink-0">
                              {added ? (
                                <IconCircleCheck className="size-5 text-success" />
                              ) : (
                                <IconChevronRight className="size-4 text-muted-foreground" />
                              )}
                            </ItemActions>
                          </button>
                        </Item>
                      </div>
                    );
                  })}
                </ItemGroup>
              )}
              {controller.lineCount > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  className="w-full"
                  onClick={() => setShowPicker(false)}
                >
                  {GRN_CREATE_COPY.addedSummary(controller.lineCount)}
                  <IconChevronRight data-icon="inline-end" />
                </Button>
              ) : null}
            </BranchOperatorPanel>
          ) : (
            <BranchOperatorPanel
              size="sm"
              title={GRN_CREATE_COPY.addedSummary(controller.lineCount)}
              headerHint={GRN_CREATE_COPY.moneyVnd(controller.total)}
              contentClassName="gap-2"
              action={
                <Button
                  type="button"
                  variant="outline"
                  size="touch"
                  onClick={() => setShowPicker(true)}
                >
                  {GRN_CREATE_COPY.addItem}
                </Button>
              }
            >
              <ItemGroup className="gap-2" role="list">
                {controller.draft.lines.map((line) => (
                  <div key={line.ingredientId} role="listitem">
                    <Item
                      asChild
                      variant="outline"
                      className="min-h-20 touch-manipulation"
                    >
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => controller.openEdit(line.ingredientId)}
                      >
                        <ItemContent className="min-w-0 gap-1">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {line.ingredientName}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs">
                            {line.unitCost != null && line.unitCost > 0 ? (
                              <>
                                {GRN_CREATE_COPY.lineUnitCost(
                                  line.quantity,
                                  line.unit,
                                  line.unitCost,
                                )}{" "}
                                <span className="font-semibold text-foreground">
                                  {GRN_CREATE_COPY.moneyVnd(
                                    line.quantity * line.unitCost,
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="font-medium text-warning">
                                {GRN_CREATE_COPY.linePriceRequired(
                                  line.quantity,
                                  line.unit,
                                )}
                              </span>
                            )}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0">
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        </ItemActions>
                      </button>
                    </Item>
                  </div>
                ))}
              </ItemGroup>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={controller.discardDraft}
              >
                <IconTrash data-icon="inline-start" />
                {GRN_CREATE_COPY.discardDraft}
              </Button>
            </BranchOperatorPanel>
          )}
        </div>

        {controller.submitError ? (
          <BranchOperatorPanel
            size="sm"
            tone="destructive"
            title={GRN_CREATE_COPY.flowErrorTitle}
          >
            <p role="alert" className="text-sm text-destructive">
              {controller.submitError}
            </p>
          </BranchOperatorPanel>
        ) : null}

        <BranchGrnCreateLineSheet
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

        {controller.lineCount > 0 && !pickerVisible ? (
          <AppDetailFooter
            sticky
            trailing={
              <Button
                type="button"
                size="touch-lg"
                onClick={
                  controller.canConfirm
                    ? controller.confirmNow
                    : controller.submit
                }
                disabled={!controller.canSubmit}
              >
                {controller.submitting ? (
                  <>
                    <Spinner className="size-5" />
                    {STATES_VI.saving}
                  </>
                ) : controller.canConfirm ? (
                  GRN_CREATE_COPY.confirmNow(
                    controller.lineCount,
                    controller.total,
                  )
                ) : (
                  GRN_CREATE_COPY.reviewBeforeConfirm(
                    controller.lineCount,
                    controller.total,
                  )
                )}
              </Button>
            }
          />
        ) : null}
      </div>
    </BranchOperatorPage>
  );
}
