import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { resolveBlockedState } from "@comtammatu/shared/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BetaLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Beta Login | Cơm Tấm Má Tư",
};

export default async function BetaLoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    returnTo?: string;
    forbidden?: string;
    reason?: string;
  }>;
}) {
  const sp = await searchParams;
  const blockedState = sp.forbidden === "1" ? resolveBlockedState(sp.reason) : null;

  return (
    <main id="main-content" className="min-h-screen bg-background">
      <div className="mx-auto grid max-w-5xl gap-6 p-4 md:p-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Beta</Badge>
              <Badge variant="outline">/beta/login</Badge>
            </div>
            <CardTitle>Đăng nhập vào beta</CardTitle>
            <CardDescription>
              Beta giữ nguyên auth, ACL và dữ liệu hiện có. Nếu bạn đi vào từ một route beta cụ
              thể, hệ thống sẽ cố quay lại đúng ngữ cảnh đó sau khi xác thực.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <p>Phase 1 hiện hỗ trợ login, admin và inventory dưới cây route `/beta/*`.</p>
              <p>Những route beta ngoài phạm vi phase 1 sẽ đi vào notice page thay vì 404 thô.</p>
            </div>
            <Link href="/login" className={buttonVariants({ variant: "outline", size: "default" })}>
              Mở login hiện tại
              <ArrowUpRight className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Đăng nhập</CardTitle>
            <CardDescription>Điểm vào riêng cho các surface beta.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blockedState ? (
              <div className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{blockedState.copy.title}</p>
                <p>
                  {blockedState.copy.description} {blockedState.copy.nextStep}
                </p>
              </div>
            ) : null}
            <BetaLoginForm returnTo={sp.returnTo} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
