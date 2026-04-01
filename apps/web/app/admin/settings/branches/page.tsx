import { Building2 } from "lucide-react";

export default function BranchesPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Chi nhánh</h1>
        <p className="mt-1 text-muted-foreground">Quản lý các chi nhánh nhà hàng</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Building2 className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">Quản lý chi nhánh sẽ có trong Sprint 1 S2.</p>
      </div>
    </div>
  );
}
