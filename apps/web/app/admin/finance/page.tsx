import { Wallet } from "lucide-react";

export default function FinancePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tài chính</h1>
        <p className="mt-1 text-muted-foreground">
          Kế toán, sổ cái và báo cáo tài chính
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Wallet className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý tài chính sẽ có trong Sprint 6.
        </p>
      </div>
    </div>
  );
}
