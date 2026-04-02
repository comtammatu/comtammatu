import { Heart } from "lucide-react";

export default function CrmPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Khách hàng</h1>
        <p className="mt-1 text-muted-foreground">
          Quản lý khách hàng và chương trình thành viên
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Heart className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          CRM và khách hàng thân thiết sẽ có trong Sprint 4.
        </p>
      </div>
    </div>
  );
}
