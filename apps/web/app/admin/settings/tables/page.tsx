import { LayoutGrid } from "lucide-react";

export default function TablesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bàn & Khu vực</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý khu vực và bàn ăn theo chi nhánh
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <LayoutGrid className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý bàn sẽ có trong Sprint 1 S5.
        </p>
      </div>
    </div>
  );
}
