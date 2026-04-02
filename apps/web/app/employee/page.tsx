import { Home } from "lucide-react";

export default function EmployeePage() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <Home className="size-12 text-muted-foreground" />
      <h1 className="mt-4 text-lg font-medium">Cổng nhân viên</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ca làm việc, lịch sử lương và thông tin cá nhân sẽ có trong phiên bản
        tiếp theo.
      </p>
    </div>
  );
}
