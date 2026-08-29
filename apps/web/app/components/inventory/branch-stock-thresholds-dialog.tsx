"use client";

import { useState, useTransition } from "react";
import { Sliders as IconSliders, Check as IconCheck, Search as IconSearch } from "lucide-react";
import { ACTIONS_VI, INVENTORY_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { AppDialog } from "@/components/form";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Input } from "@comtammatu/ui/components/input";
import type { BranchStockThresholdRow } from "@lib/inventory/branch-thresholds-data";
import { saveBranchStockThresholdsAction } from "@/(protected)/inventory/stock-actions";

export function BranchStockThresholdsDialog({
  branchId,
  branchName,
  initialRows,
}: {
  branchId: number;
  branchName?: string | null;
  initialRows: BranchStockThresholdRow[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState(initialRows);
  const [isPending, startTransition] = useTransition();
  const [savedSuccess, setSavedSuccess] = useState(false);

  const filteredRows = rows.filter((r) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      r.ingredientName.toLowerCase().includes(q) ||
      (r.sku && r.sku.toLowerCase().includes(q)) ||
      (r.categoryName && r.categoryName.toLowerCase().includes(q))
    );
  });

  const handleMinStockChange = (ingredientId: number, val: string) => {
    const num = val === "" ? 0 : Number(val);
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === ingredientId
          ? {
              ...r,
              branchMinStock: num,
              effectiveMinStock: num,
              isCustomized: true,
            }
          : r,
      ),
    );
  };

  const handleReorderQtyChange = (ingredientId: number, val: string) => {
    const num = val === "" ? null : Number(val);
    setRows((prev) =>
      prev.map((r) =>
        r.ingredientId === ingredientId
          ? {
              ...r,
              reorderQuantity: num,
              isCustomized: true,
            }
          : r,
      ),
    );
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveBranchStockThresholdsAction({
        branchId,
        thresholds: rows.map((r) => ({
          ingredientId: r.ingredientId,
          minStockLevel: r.effectiveMinStock,
          reorderQuantity: r.reorderQuantity,
        })),
      });

      if (res.success) {
        setSavedSuccess(true);
        setTimeout(() => {
          setSavedSuccess(false);
          setOpen(false);
        }, 1200);
      }
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => setOpen(true)}
      >
        <IconSliders className="size-4" />
        <span>{INVENTORY_VI.branchThresholdsTitle}</span>
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={INVENTORY_VI.branchThresholdsTitle}
        description={`${branchName ? `${branchName} — ` : ""}${INVENTORY_VI.branchThresholdsDescription}`}
        contentClassName="max-w-3xl"
        footer={
          <div className="flex w-full items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {INVENTORY_VI.branchThresholdsItemCount(filteredRows.length)}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {ACTIONS_VI.cancel}
              </Button>
              <Button onClick={handleSave} disabled={isPending || savedSuccess}>
                {savedSuccess ? (
                  <>
                    <IconCheck className="size-4 mr-1 text-success" />
                    <span>{INVENTORY_VI.branchThresholdsSaveSuccess}</span>
                  </>
                ) : isPending ? (
                  INVENTORY_VI.submittingEllipsis
                ) : (
                  ACTIONS_VI.save
                )}
              </Button>
            </div>
          </div>
        }
      >
        <div className="flex flex-col gap-3 max-h-96 overflow-y-auto">
          {/* Search bar */}
          <InputGroup>
            <InputGroupAddon>
              <IconSearch className="size-4 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={INVENTORY_VI.countAssignSearchPlaceholder}
            />
          </InputGroup>

          {/* List of ingredients */}
          <div className="flex flex-col gap-2">
            {filteredRows.map((r) => (
              <Frame key={r.ingredientId} className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{r.ingredientName}</span>
                    <Badge variant={r.isCustomized ? "default" : "secondary"}>
                      {r.isCustomized
                        ? INVENTORY_VI.branchThresholdsCustomizedBadge
                        : INVENTORY_VI.branchThresholdsGlobalBadge}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    <span>{r.categoryName || INVENTORY_VI.uncategorized}</span>
                    <span>{INVENTORY_VI.unitPrefix(r.baseUnitCode || r.baseUnitName || "—")}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex flex-col gap-1 w-28">
                    <label className="text-2xs text-muted-foreground">{INVENTORY_VI.colMinStockLevel}</label>
                    <Input
                      type="number"
                      min={0}
                      value={r.effectiveMinStock}
                      onChange={(e) => handleMinStockChange(r.ingredientId, e.target.value)}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>

                  <div className="flex flex-col gap-1 w-28">
                    <label className="text-2xs text-muted-foreground">{INVENTORY_VI.colReorderQuantity}</label>
                    <Input
                      type="number"
                      min={0}
                      value={r.reorderQuantity ?? ""}
                      placeholder={INVENTORY_VI.autoPlaceholder}
                      onChange={(e) => handleReorderQtyChange(r.ingredientId, e.target.value)}
                      className="h-8 text-xs tabular-nums"
                    />
                  </div>
                </div>
              </Frame>
            ))}

            {filteredRows.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">
                {INVENTORY_VI.countAssignNoIngredientMatches}
              </div>
            )}
          </div>
        </div>
      </AppDialog>
    </>
  );
}
