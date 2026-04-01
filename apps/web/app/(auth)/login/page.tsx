import { UtensilsCrossed } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center space-y-2 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-primary">
            <UtensilsCrossed className="size-8 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Cơm Tấm Má Tư</h1>
          <p className="text-sm text-muted-foreground">
            Hệ thống quản lý nhà hàng
          </p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Đăng nhập</CardTitle>
            <CardDescription>
              Nhập thông tin để truy cập hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          &copy; 2026 Cơm Tấm Má Tư CTCP
        </p>
      </div>
    </div>
  );
}
