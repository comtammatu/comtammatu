import { Briefcase } from "lucide-react";

export default function HrPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nhân sự & Lương</h1>
        <p className="mt-1 text-muted-foreground">
          Hồ sơ nhân viên, ca làm, bảng lương, BHXH
        </p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <Briefcase className="size-12 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-medium">Tính năng đang phát triển</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý nhân sự và bảng lương sẽ có trong Sprint 6.
        </p>
      </div>
    </div>
  );
}
