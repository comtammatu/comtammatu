"use client";

import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  ChevronRight as IconChevronRight,
  CircleCheck as IconCircleCheck,
  Receipt as IconReceipt,
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
import {
  AppDetailFooter,
  AppEmptyState,
  DescriptionList,
} from "@/components/surface";
import {
  BranchOperatorControlBar,
  BranchOperatorPage,
  BranchOperatorPanel,
} from "@lib/branch-operator/components/branch-operator-page";
import { GRN_CREATE_COPY } from "@lib/inventory/grn-create-copy";
import {
  getGrnLocationKindLabel,
  type GrnCreatePageData,
} from "@lib/inventory/grn-create-model";
import { useGrnCreateController } from "@lib/inventory/use-grn-create-controller";
import { messages } from "@lib/messages";

interface BranchGrnCreateClientProps extends GrnCreatePageData {
  sourceBasePath: string;
  grnBasePath: string;
}

export function BranchGrnCreateClient({
  sourceBasePath,
  grnBasePath,
  ...data
}: BranchGrnCreateClientProps) {
  const controller = useGrnCreateController({
    ...data,
    basePath: sourceBasePath,
    grnBasePath,
  });

  return (
    <BranchOperatorPage
      title={GRN_CREATE_COPY.newReceiptEyebrow}
      hideHeaderOnMobile
    >
      <div className="flex min-w-0 touch-manipulation flex-col gap-3">
        <BranchOperatorControlBar className="sm:hidden">
          <Button
            variant="ghost"
            size="icon-touch"
            render={
              <Link
                href={sourceBasePath}
                aria-label={GRN_CREATE_COPY.backToList}
              />
            }
          >
            <IconArrowLeft />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {GRN_CREATE_COPY.newReceiptTitle}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {controller.supplierSummary}
            </p>
          </div>
        </BranchOperatorControlBar>

        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-3">
            <BranchOperatorPanel
              size="sm"
              title={GRN_CREATE_COPY.newReceiptTitle}
              icon={IconReceipt}
              contentClassName="gap-3"
            >
              <DescriptionList
                className="grid gap-2"
                descriptionClassName="font-semibold"
                items={[
                  {
                    term: messages.inventory.grn.supplier,
                    description: controller.supplierSummary,
                  },
                  {
                    term: messages.inventory.grn.receivingWarehouse,
                    description: controller.selectedBranchName,
                  },
                ]}
              />
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
                    disabled={
                      controller.submitting || controller.receivingSiteSaving
                    }
                  >
                    <SelectTrigger
                      id="branch-grn-receiving-location"
                      size="touch"
                      className="w-full"
                    >
                      <SelectValue
                        placeholder={GRN_CREATE_COPY.locationUnselected}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {controller.branchLocations.map((location) => (
                        <SelectItem
                          key={location.id}
                          value={String(location.id)}
                          size="touch"
                        >
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
            </BranchOperatorPanel>

            {controller.lineCount > 0 ? (
              <BranchOperatorPanel
                size="sm"
                title={GRN_CREATE_COPY.addedSummary(controller.lineCount)}
                contentClassName="gap-2"
              >
                <ItemGroup className="gap-2" role="list">
                  {controller.draft.lines.map((line) => (
                    <div key={line.ingredientId} role="listitem">
                      <Item
                        variant="outline"
                        className="min-h-20 touch-manipulation"
                        render={
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() =>
                              controller.openEdit(line.ingredientId)
                            }
                          />
                        }
                      >
                        <ItemContent className="min-w-0 gap-1">
                          <ItemTitle className="line-clamp-none text-sm font-semibold">
                            {line.ingredientName}
                          </ItemTitle>
                          <ItemDescription className="line-clamp-none text-xs">
                            {line.supplierName} ·{" "}
                            {GRN_CREATE_COPY.lineQtyOnly(line.quantity, line.unit)}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="shrink-0">
                          <IconChevronRight className="size-4 text-muted-foreground" />
                        </ItemActions>
                      </Item>
                    </div>
                  ))}
                </ItemGroup>
              </BranchOperatorPanel>
            ) : null}
          </div>

          <BranchOperatorPanel
            size="sm"
            title={GRN_CREATE_COPY.addItem}
            description={GRN_CREATE_COPY.searchPlaceholder}
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

            {controller.filtered.length === 0 ? (
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
                        variant="outline"
                        className="min-h-16 touch-manipulation"
                        render={
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => controller.openEdit(ingredient.id)}
                          />
                        }
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
                      </Item>
                    </div>
                  );
                })}
              </ItemGroup>
            )}
          </BranchOperatorPanel>
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

        <AppDetailFooter
          sticky
          leading={
            <Button
              variant="outline"
              size="touch"
              render={<Link href={sourceBasePath} />}
            >
              <IconArrowLeft data-icon="inline-start" />
              {GRN_CREATE_COPY.backToList}
            </Button>
          }
          trailing={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-80">
              {controller.lineCount > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={controller.discardDraft}
                >
                  <IconTrash data-icon="inline-start" />
                  {GRN_CREATE_COPY.discardDraft}
                </Button>
              ) : null}
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
      </div>
    </BranchOperatorPage>
  );
}
