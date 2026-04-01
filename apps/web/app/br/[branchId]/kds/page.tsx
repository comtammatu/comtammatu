import { ChefHat } from "lucide-react";

export default function KdsPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <ChefHat className="mx-auto size-16 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-bold">KDS — Màn hình bếp</h1>
        <p className="mt-2 text-muted-foreground">
          Hệ thống hiển thị bếp sẽ có trong Sprint 2a.
        </p>
      </div>
    </div>
  );
}
