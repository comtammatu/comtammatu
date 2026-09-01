/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: inventory document UI */
"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight as IconArrowLeftRight,
  RotateCcw as IconRotateCcw,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Textarea } from "@comtammatu/ui/components/textarea";
import { toast } from "@comtammatu/ui/components/sonner";
import { QuantityInput } from "@/components/form/domain-number-inputs";
import { AppDialog } from "@/components/form";
import { AppEmptyState } from "@/components/surface";
import type { IntraSiteTransferData } from "@lib/inventory/intra-site-transfer-data";
import type { TransferDetail } from "@lib/inventory/transfer-detail-model";
import {
  commitIntraSiteTransfer,
  reverseIntraSiteTransfer,
} from "@/(protected)/inventory/transfer-actions";

type Direction = "warehouse_to_kitchen" | "kitchen_to_warehouse";

function positiveQuantity(value: string | undefined): number | null {
  const quantity = Number(value ?? "");
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function IntraSiteTransferDialog({
  data,
  triggerSize = "default",
  detailBasePath,
  initialQuantities = {},
  triggerLabel = "Cấp Kho ↔ Bếp",
}: {
  data: IntraSiteTransferData;
  triggerSize?: ComponentProps<typeof Button>["size"];
  detailBasePath?: string;
  initialQuantities?: Record<number, number>;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<Direction>("warehouse_to_kitchen");
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      Object.entries(initialQuantities).map(([id, quantity]) => [
        id,
        String(quantity),
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  const source =
    direction === "warehouse_to_kitchen" ? data.warehouse : data.kitchen;
  const destination =
    direction === "warehouse_to_kitchen" ? data.kitchen : data.warehouse;
  const availableIngredients = useMemo(
    () =>
      data.ingredients.filter((ingredient) =>
        direction === "warehouse_to_kitchen"
          ? ingredient.warehouseQuantity > 0
          : ingredient.kitchenQuantity > 0,
      ),
    [data.ingredients, direction],
  );

  function availableQuantity(ingredientId: number): number {
    const ingredient = data.ingredients.find(
      (candidate) => candidate.ingredientId === ingredientId,
    );
    if (!ingredient) return 0;
    return direction === "warehouse_to_kitchen"
      ? ingredient.warehouseQuantity
      : ingredient.kitchenQuantity;
  }

  function changeDirection(nextDirection: Direction) {
    setDirection(nextDirection);
    setQuantities({});
    idempotencyKey.current = null;
  }

  function fillAll() {
    setQuantities(
      Object.fromEntries(
        availableIngredients.map((ingredient) => [
          ingredient.ingredientId,
          String(availableQuantity(ingredient.ingredientId)),
        ]),
      ),
    );
    idempotencyKey.current = null;
  }

  function submit() {
    let invalidIngredient: string | null = null;
    const lines = availableIngredients.flatMap((ingredient) => {
      const quantity = positiveQuantity(quantities[ingredient.ingredientId]);
      if (quantity == null) return [];
      if (quantity > availableQuantity(ingredient.ingredientId)) {
        invalidIngredient ??= ingredient.name;
        return [];
      }
      return [
        {
          ingredientId: ingredient.ingredientId,
          quantity,
          entryUnitId: ingredient.baseUnitId,
        },
      ];
    });
    if (invalidIngredient) {
      toast.error(`Số lượng ${invalidIngredient} vượt tồn tại nơi xuất.`);
      return;
    }
    if (lines.length === 0) {
      toast.error("Nhập số lượng cần chuyển cho ít nhất một mặt hàng.");
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();

    startTransition(async () => {
      const result = await commitIntraSiteTransfer({
        branchId: data.branchId,
        fromLocationId: source.id,
        toLocationId: destination.id,
        lines,
        notes,
        idempotencyKey: idempotencyKey.current!,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể hoàn tất điều chuyển nội bộ.");
        return;
      }
      const transferId = (result.data as { id?: number } | undefined)?.id;
      toast.success("Đã hoàn tất điều chuyển nội bộ.");
      setOpen(false);
      setQuantities({});
      setNotes("");
      idempotencyKey.current = null;
      if (detailBasePath && transferId) {
        router.push(`${detailBasePath}/${transferId}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        <IconArrowLeftRight data-icon="inline-start" />
        {triggerLabel}
      </Button>
      <AppDialog
        variant="document"
        open={open}
        onOpenChange={setOpen}
        title="Điều chuyển nội bộ Kho ↔ Bếp"
        description="Kiểm tra số lượng rồi xác nhận một lần. Phiếu hoàn tất ngay."
        footer={
          <div className="flex w-full items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Đóng
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              Xác nhận điều chuyển
            </Button>
          </div>
        }
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={
                direction === "warehouse_to_kitchen" ? "secondary" : "outline"
              }
              onClick={() => changeDirection("warehouse_to_kitchen")}
            >
              Kho → Bếp
            </Button>
            <Button
              type="button"
              variant={
                direction === "kitchen_to_warehouse" ? "secondary" : "outline"
              }
              onClick={() => changeDirection("kitchen_to_warehouse")}
            >
              Bếp → Kho
            </Button>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              {source.name} → {destination.name}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fillAll}
              disabled={availableIngredients.length === 0}
            >
              Chuyển toàn bộ tồn
            </Button>
          </div>
          {availableIngredients.length === 0 ? (
            <AppEmptyState
              compact
              title="Nơi xuất chưa có tồn"
              description="Chọn chiều ngược lại hoặc nhập hàng vào Kho trước."
            />
          ) : (
            <ScrollArea className="h-80">
              <div className="flex flex-col gap-2 pr-2">
                {availableIngredients.map((ingredient) => (
                  <Item key={ingredient.ingredientId} variant="outline">
                    <ItemContent>
                      <ItemTitle>{ingredient.name}</ItemTitle>
                      <ItemDescription>
                        Có {availableQuantity(ingredient.ingredientId)}{" "}
                        {ingredient.unit}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="w-40">
                      <QuantityInput
                        value={quantities[ingredient.ingredientId] ?? ""}
                        onValueChange={(value) => {
                          setQuantities((current) => ({
                            ...current,
                            [ingredient.ingredientId]: value,
                          }));
                          idempotencyKey.current = null;
                        }}
                        maxFractionDigits={3}
                        placeholder="0"
                        aria-label={`Số lượng ${ingredient.name}`}
                      />
                    </ItemActions>
                  </Item>
                ))}
              </div>
            </ScrollArea>
          )}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ghi chú (không bắt buộc)"
            aria-label="Ghi chú điều chuyển nội bộ"
          />
        </div>
      </AppDialog>
    </>
  );
}

export function ReverseIntraSiteTransferDialog({
  transfer,
  triggerSize = "default",
}: {
  transfer: TransferDetail;
  triggerSize?: ComponentProps<typeof Button>["size"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(
      transfer.items.map((item) => [
        item.ingredientId,
        String(item.reversibleQty ?? item.qty),
      ]),
    ),
  );
  const [notes, setNotes] = useState("");
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef<string | null>(null);

  function submit() {
    let invalidIngredient: string | null = null;
    const lines = transfer.items.flatMap((item) => {
      const quantity = positiveQuantity(quantities[item.ingredientId]);
      if (quantity == null) return [];
      const remaining = item.reversibleQty ?? item.qty;
      if (quantity > remaining) {
        invalidIngredient ??= item.name;
        return [];
      }
      return [
        {
          ingredientId: item.ingredientId,
          quantity,
          entryUnitId: item.entryUnitId,
        },
      ];
    });
    if (invalidIngredient) {
      toast.error(`Số lượng ${invalidIngredient} vượt phần còn được đảo.`);
      return;
    }
    if (lines.length === 0) {
      toast.error("Chọn ít nhất một dòng cần đảo.");
      return;
    }
    idempotencyKey.current ??= crypto.randomUUID();
    startTransition(async () => {
      const result = await reverseIntraSiteTransfer({
        transferId: transfer.id,
        lines,
        notes,
        idempotencyKey: idempotencyKey.current!,
      });
      if (!result.success) {
        toast.error(result.error ?? "Không thể đảo phiếu.");
        return;
      }
      toast.success("Đã tạo phiếu đảo.");
      setOpen(false);
      idempotencyKey.current = null;
      router.refresh();
    });
  }

  const hasRemaining = transfer.items.some(
    (item) => (item.reversibleQty ?? item.qty) > 0,
  );
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={triggerSize}
        onClick={() => setOpen(true)}
        disabled={!hasRemaining}
      >
        <IconRotateCcw data-icon="inline-start" />
        Đảo phiếu
      </Button>
      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title={`Đảo phiếu ${transfer.code}`}
        description="Phiếu đảo đi theo chiều ngược lại và không được vượt phần còn lại."
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Đóng
            </Button>
            <Button type="button" onClick={submit} disabled={isPending}>
              Tạo phiếu đảo
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {transfer.items.map((item) => {
            const remaining = item.reversibleQty ?? item.qty;
            return (
              <Item key={item.ingredientId} variant="outline">
                <ItemContent>
                  <ItemTitle>{item.name}</ItemTitle>
                  <ItemDescription>
                    Còn được đảo {remaining} {item.unit}
                  </ItemDescription>
                </ItemContent>
                <ItemActions className="w-40">
                  <QuantityInput
                    value={quantities[item.ingredientId] ?? ""}
                    onValueChange={(value) => {
                      setQuantities((current) => ({
                        ...current,
                        [item.ingredientId]: value,
                      }));
                      idempotencyKey.current = null;
                    }}
                    maxFractionDigits={3}
                    disabled={remaining <= 0}
                    aria-label={`Số lượng đảo ${item.name}`}
                  />
                </ItemActions>
              </Item>
            );
          })}
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Lý do đảo phiếu"
            aria-label="Lý do đảo phiếu"
          />
        </div>
      </AppDialog>
    </>
  );
}
