"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconChefHat,
  IconClipboardList,
  IconBuildingFactory,
  IconPackageImport,
  IconBuildingStore,
  IconTruck,
} from "@tabler/icons-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@comtammatu/ui/components/alert-dialog";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { toast } from "@comtammatu/ui/components/sonner";
import { MobilePage } from "../../_components/mobile/mobile-page";
import { MobileEmptyState } from "../../_components/mobile/mobile-empty-state";
import { MobileSectionHeader } from "../../_components/mobile/mobile-section-header";
import { formatDateTime, formatVND } from "../../_lib/format";
import {
  cancelProductionOrder,
  confirmProductionOrder,
} from "../../production-actions";
import { MobileProductionOrderForm } from "./mobile-production-order-form";
import {
  badgeVariantFromTone,
  getProductionReadinessSummary,
  orderStatusLabel,
  orderStatusTone,
} from "../../production-types";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  ProductionOrderRow,
  ProductionRecipeRow,
} from "../../production-types";

interface MobileProductionClientProps {
  canManageCatalog: boolean;
  canManageRecipes: boolean;
  canCreateProduction: boolean;
  canConfirmProduction: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

type OrderTab = "draft" | "completed" | "cancelled";

export function MobileProductionClient({
  canManageCatalog,
  canManageRecipes,
  canCreateProduction,
  canConfirmProduction,
  centralKitchenBranches,
  ingredients,
  finishedGoods,
  orders,
  recipes,
}: MobileProductionClientProps) {
  const {
    sortedFinishedGoods,
    readinessState,
    readinessMessage,
    actionsEnabled,
  } = useMemo(
    () =>
      getProductionReadinessSummary({
        centralKitchenBranches,
        ingredients,
        finishedGoods,
        recipes,
      }),
    [centralKitchenBranches, finishedGoods, ingredients, recipes],
  );

  const orderGroups = useMemo<Record<OrderTab, ProductionOrderRow[]>>(
    () => ({
      draft: orders.filter((order) => order.status === "draft"),
      completed: orders.filter((order) => order.status === "completed"),
      cancelled: orders.filter((order) => order.status === "cancelled"),
    }),
    [orders],
  );

  const stats = useMemo(
    () => [
      {
        label: "Lệnh nháp",
        value: String(orderGroups.draft.length),
        icon: IconClipboardList,
      },
      {
        label: "Đã hoàn tất",
        value: String(orderGroups.completed.length),
        icon: IconPackageImport,
      },
      {
        label: "Bếp hoạt động",
        value: String(centralKitchenBranches.length),
        icon: IconBuildingStore,
      },
    ],
    [
      centralKitchenBranches.length,
      orderGroups.completed.length,
      orderGroups.draft.length,
    ],
  );

  const recoveryHref =
    readinessState === "missing-finished-good" ||
    readinessState === "missing-raw-material"
      ? "/inventory/ingredients"
      : readinessState === "missing-recipe"
        ? "/inventory/production"
        : "/inventory/production";
  const canFixReadiness =
    readinessState === "missing-recipe"
      ? canManageRecipes
      : (readinessState === "missing-finished-good" ||
            readinessState === "missing-raw-material") &&
          canManageCatalog;

  return (
    <MobilePage>
      <MobileSectionHeader
        backHref="/inventory/m"
        backLabel="Trang chính"
        eyebrow="Bếp trung tâm"
        title="Lệnh sản xuất"
        description="Tạo, xác nhận và bàn giao thành phẩm ngay trên điện thoại."
      />

      <div className="grid grid-cols-3 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="space-y-2 p-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-lg font-semibold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card
        className={readinessMessage ? "border-warning/30 bg-warning/10" : ""}
      >
        <CardHeader className="space-y-3 pb-3">
          <div className="flex items-start gap-3">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-background text-primary shadow-sm">
              {readinessMessage ? (
                <IconAlertTriangle className="size-5" />
              ) : (
                <IconChefHat className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base">
                {readinessMessage
                  ? "Chưa sẵn sàng để sản xuất"
                  : "Bước tiếp theo"}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {readinessMessage
                  ? readinessMessage
                  : "Tạo lệnh nháp mới hoặc chốt các lệnh đang chờ để chuyển thành phẩm sang điều chuyển."}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pt-0">
          {actionsEnabled && canCreateProduction ? (
            <>
              <MobileProductionOrderForm
                centralKitchenBranches={centralKitchenBranches}
                finishedGoodsOptions={sortedFinishedGoods}
                actionsEnabled={actionsEnabled}
              />
              <Button type="button" variant="outline" asChild>
                <Link href="/inventory/m/transfers?tab=dispatch">
                  <IconTruck className="mr-2 size-4" />
                  Mở điều chuyển thành phẩm
                </Link>
              </Button>
            </>
          ) : canFixReadiness ? (
            <Button type="button" asChild>
              <Link href={recoveryHref}>
                <IconBuildingFactory className="mr-2 size-4" />
                Mở màn hình xử lý
              </Link>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" asChild>
            <Link href="/inventory/production">
              Mở bản đầy đủ
              <IconArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Tabs defaultValue="draft" className="space-y-3">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draft">Nháp</TabsTrigger>
          <TabsTrigger value="completed">Đã xong</TabsTrigger>
          <TabsTrigger value="cancelled">Đã hủy</TabsTrigger>
        </TabsList>

        <TabsContent value="draft" className="m-0">
          <ProductionOrderCardList
            orders={orderGroups.draft}
            canConfirmProduction={canConfirmProduction}
            emptyTitle="Không có lệnh nháp"
            emptyDescription="Tạo lệnh mới khi bếp đã sẵn sàng và cần chạy mẻ tiếp theo."
          />
        </TabsContent>

        <TabsContent value="completed" className="m-0">
          <ProductionOrderCardList
            orders={orderGroups.completed}
            canConfirmProduction={canConfirmProduction}
            emptyTitle="Chưa có lệnh hoàn tất"
            emptyDescription="Sau khi xác nhận, lệnh hoàn tất sẽ hiện ở đây để chuẩn bị điều chuyển."
          />
        </TabsContent>

        <TabsContent value="cancelled" className="m-0">
          <ProductionOrderCardList
            orders={orderGroups.cancelled}
            canConfirmProduction={canConfirmProduction}
            emptyTitle="Chưa có lệnh bị hủy"
            emptyDescription="Các lệnh nháp bị hủy sẽ được lưu tại đây để đối chiếu."
          />
        </TabsContent>
      </Tabs>
    </MobilePage>
  );
}

function ProductionOrderCardList({
  orders,
  canConfirmProduction,
  emptyTitle,
  emptyDescription,
}: {
  orders: ProductionOrderRow[];
  canConfirmProduction: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null);

  function handleConfirm(orderId: number) {
    startTransition(async () => {
      const result = await confirmProductionOrder(orderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể xác nhận");
        return;
      }
      toast.success("Đã xác nhận lệnh sản xuất");
      router.refresh();
    });
  }

  function handleCancel() {
    if (cancelOrderId == null) return;
    startTransition(async () => {
      const result = await cancelProductionOrder(cancelOrderId);
      if (!result.success) {
        toast.error(result.error ?? "Không thể hủy");
        return;
      }
      toast.success("Đã hủy lệnh sản xuất");
      setCancelOrderId(null);
      router.refresh();
    });
  }

  if (orders.length === 0) {
    return (
      <MobileEmptyState
        icon={IconClipboardList}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {orders.map((order) => (
          <Card key={order.id}>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold leading-tight">
                    {order.production_number}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDateTime(order.created_at)}</span>
                    <span>{order.branch_name}</span>
                  </div>
                </div>
                <Badge
                  variant={badgeVariantFromTone(orderStatusTone(order.status))}
                >
                  {orderStatusLabel(order.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/30 p-3">
                <div>
                  <p className="text-xs text-muted-foreground">Thành phẩm</p>
                  <p className="text-sm font-semibold">
                    {order.items.length} dòng
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tổng chi phí</p>
                  <p className="text-sm font-semibold">
                    {formatVND(order.total_cost)}đ
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {order.items.map((item) => (
                  <Badge
                    key={item.id}
                    variant={badgeVariantFromTone("neutral")}
                    className="px-2 py-1 text-xs"
                  >
                    {item.finished_good_name} x {item.quantity} {item.unit}
                  </Badge>
                ))}
              </div>

              {order.notes ? (
                <div className="rounded-xl border border-dashed bg-muted/20 p-3">
                  <p className="text-xs text-muted-foreground">Ghi chú</p>
                  <p className="mt-1 text-sm">{order.notes}</p>
                </div>
              ) : null}

              {order.status === "draft" && canConfirmProduction ? (
                <div className="flex flex-col gap-2">
                  <Button
                    type="button"
                    onClick={() => handleConfirm(order.id)}
                    disabled={isPending}
                  >
                    <IconCircleCheck className="mr-2 size-4" />
                    Xác nhận lệnh
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelOrderId(order.id)}
                    disabled={isPending}
                  >
                    Hủy lệnh
                  </Button>
                </div>
              ) : order.status === "completed" ? (
                <Button type="button" variant="outline" asChild>
                  <Link href="/inventory/m/transfers?tab=dispatch">
                    <IconTruck className="mr-2 size-4" />
                    Sang điều chuyển thành phẩm
                  </Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog
        open={cancelOrderId != null}
        onOpenChange={(open) => {
          if (!open) setCancelOrderId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hủy lệnh sản xuất?</AlertDialogTitle>
            <AlertDialogDescription>
              Lệnh đang ở trạng thái nháp. Hãy dùng hủy nếu bạn không muốn tiếp
              tục mẻ này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Quay lại</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={isPending}>
              Hủy lệnh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
