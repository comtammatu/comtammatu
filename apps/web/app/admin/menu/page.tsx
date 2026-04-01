import { UtensilsCrossed } from "lucide-react";

export default function MenuPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Thực đơn</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý danh mục và món ăn
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <UtensilsCrossed className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý thực đơn sẽ có trong Sprint 1 S4.
        </p>
      </div>
    </div>
  );
}
