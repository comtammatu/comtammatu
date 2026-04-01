import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Cơm Tấm Má Tư</h1>
          <p className="text-muted-foreground">Đăng nhập hệ thống quản lý</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
