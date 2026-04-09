import { StatementsClient } from "./statements-client";

export default function StatementsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Báo cáo tài chính</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          BCTC theo chuẩn VAS — Bảng CĐKT, KQKD, Tổng hợp VAT
        </p>
      </div>

      <StatementsClient />
    </div>
  );
}
