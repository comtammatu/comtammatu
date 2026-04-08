import { Heart } from "lucide-react";

export default function CrmPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Khách hàng</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý khách hàng và chương trình thành viên
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 py-32 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Heart className="size-8 text-primary" />
        </div>
        <h2 className="mt-5 text-lg font-semibold">
          Tính năng đang phát triển
        </h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Loyalty program và quản lý khách hàng thân thiết sẽ ra mắt sau v1.0.
        </p>
      </div>
    </div>
  );
}
