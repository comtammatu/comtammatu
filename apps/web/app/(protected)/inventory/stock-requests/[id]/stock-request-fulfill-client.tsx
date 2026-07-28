"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  getInventorySiteKindLabelVi,
  type SiteKind,
} from "@comtammatu/shared/labels";
import { Button } from "@comtammatu/ui/components/button";
import { Label } from "@comtammatu/ui/components/label";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { toast } from "@comtammatu/ui/components/sonner";
import {
  AppPage,
  AppPageHeader,
  AppSection,
} from "@/components/surface";
import { messages } from "@lib/messages";
import { fulfillStockRequestLines } from "@/(protected)/inventory/stock-request-actions";

const copy = messages.inventory.stockRequests.fulfill;

export type StockRequestFulfillLine = {
  id: number;
  ingredientName: string;
  quantity: number;
  fulfillSiteKind: "central_supply" | "central_kitchen";
  status: string;
};

export type StockRequestFulfillGroup = {
  fulfillSiteKind: "central_supply" | "central_kitchen";
  fromBranchId: number;
  locations: Array<{ id: number; label: string }>;
  lines: StockRequestFulfillLine[];
};

interface StockRequestFulfillClientProps {
  requestId: number;
  requestNumber: string;
  status: string;
  branchLabel: string;
  groups: StockRequestFulfillGroup[];
}

function siteKindLabel(kind: SiteKind): string {
  return getInventorySiteKindLabelVi(kind);
}

export function StockRequestFulfillClient({
  requestId,
  requestNumber,
  status,
  branchLabel,
  groups,
}: StockRequestFulfillClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedByGroup, setSelectedByGroup] = useState<
    Record<string, Set<number>>
  >(() =>
    Object.fromEntries(
      groups.map((group) => [group.fulfillSiteKind, new Set<number>()]),
    ),
  );
  const [locationByGroup, setLocationByGroup] = useState<
    Record<string, string>
  >(() =>
    Object.fromEntries(
      groups.map((group) => [
        group.fulfillSiteKind,
        group.locations[0] ? String(group.locations[0].id) : "",
      ]),
    ),
  );

  function toggleLine(groupKind: string, lineId: number, checked: boolean) {
    setSelectedByGroup((current) => {
      const next = new Set(current[groupKind] ?? []);
      if (checked) next.add(lineId);
      else next.delete(lineId);
      return { ...current, [groupKind]: next };
    });
  }

  function selectAllPending(groupKind: string, lineIds: number[]) {
    setSelectedByGroup((current) => ({
      ...current,
      [groupKind]: new Set(lineIds),
    }));
  }

  function handleFulfill(group: StockRequestFulfillGroup) {
    const selected = [...(selectedByGroup[group.fulfillSiteKind] ?? [])];
    const fromLocationId = Number(locationByGroup[group.fulfillSiteKind]);

    if (selected.length === 0) {
      toast.error(copy.toastSelectLine);
      return;
    }
    if (!Number.isInteger(fromLocationId) || fromLocationId <= 0) {
      toast.error(copy.toastSelectLocation);
      return;
    }

    startTransition(async () => {
      const result = await fulfillStockRequestLines({
        requestId,
        fulfillSiteKind: group.fulfillSiteKind,
        fromBranchId: group.fromBranchId,
        fromLocationId,
        itemIds: selected,
      });

      if (!result.success || !result.data) {
        toast.error(result.error ?? copy.toastFulfillFailed);
        return;
      }

      toast.success(copy.toastTransferCreated);
      router.push(`/inventory/transfers/${result.data.transferId}`);
      router.refresh();
    });
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={requestNumber}
        description={copy.headerDescription(branchLabel, status)}
        actions={
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/inventory/stock-requests" />}
          >
            {copy.back}
          </Button>
        }
      />

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noLinesInScope}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <AppSection
              key={group.fulfillSiteKind}
              title={copy.sourceTitle(siteKindLabel(group.fulfillSiteKind))}
            >
              <ul className="mb-3 flex flex-col gap-2">
                {group.lines.map((line) => (
                  <li key={line.id}>
                    <Item variant="outline" size="sm">
                      {line.status === "pending" ? (
                        <input
                          type="checkbox"
                          className="mt-1 shrink-0"
                          checked={selectedByGroup[group.fulfillSiteKind]?.has(
                            line.id,
                          )}
                          onChange={(event) =>
                            toggleLine(
                              group.fulfillSiteKind,
                              line.id,
                              event.target.checked,
                            )
                          }
                          disabled={isPending}
                          aria-label={copy.selectLineAria(line.ingredientName)}
                        />
                      ) : null}
                      <ItemContent>
                        <ItemTitle>{line.ingredientName}</ItemTitle>
                        <ItemDescription>
                          {copy.lineDescription(line.quantity, line.status)}
                        </ItemDescription>
                      </ItemContent>
                    </Item>
                  </li>
                ))}
              </ul>

              {group.lines.some((line) => line.status === "pending") ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      selectAllPending(
                        group.fulfillSiteKind,
                        group.lines
                          .filter((line) => line.status === "pending")
                          .map((line) => line.id),
                      )
                    }
                  >
                    {copy.selectAllPending}
                  </Button>

                  {group.locations.length > 1 ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`fulfill-location-${group.fulfillSiteKind}`}>
                        {copy.exportLocation}
                      </Label>
                      <Select
                        value={locationByGroup[group.fulfillSiteKind] ?? ""}
                        onValueChange={(value) =>
                          setLocationByGroup((current) => ({
                            ...current,
                            [group.fulfillSiteKind]: value,
                          }))
                        }
                      >
                        <SelectTrigger
                          id={`fulfill-location-${group.fulfillSiteKind}`}
                          className="w-full"
                        >
                          <SelectValue placeholder={copy.chooseExportLocation} />
                        </SelectTrigger>
                        <SelectContent>
                          {group.locations.map((location) => (
                            <SelectItem
                              key={location.id}
                              value={String(location.id)}
                            >
                              {location.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : group.locations.length === 1 ? (
                    <p className="text-sm text-muted-foreground">
                      {copy.exportFrom(group.locations[0]!.label)}
                    </p>
                  ) : (
                    <p className="text-sm text-destructive">
                      {copy.noStockLocation}
                    </p>
                  )}

                  <Button
                    type="button"
                    disabled={
                      isPending ||
                      group.locations.length === 0 ||
                      !group.lines.some((line) => line.status === "pending")
                    }
                    onClick={() => handleFulfill(group)}
                  >
                    {isPending
                      ? copy.processing
                      : copy.fulfillButton(
                          siteKindLabel(group.fulfillSiteKind),
                        )}
                  </Button>
                </div>
              ) : null}
            </AppSection>
          ))}
        </div>
      )}
    </AppPage>
  );
}
