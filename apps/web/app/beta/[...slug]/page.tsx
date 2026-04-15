import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ExternalLink, Wrench } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { buildLoginBlockedStatePath, extractClaims } from "@comtammatu/shared/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBetaNoticeLegacyHref } from "../_lib/routes";

export default async function BetaFallbackPage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const betaHref = `/beta/${slug.join("/")}`;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    redirect(`/beta/login?returnTo=${encodeURIComponent(betaHref)}`);
  }

  const claims = extractClaims(session.user.app_metadata);
  if (!claims) {
    redirect(buildLoginBlockedStatePath("missing-auth-context", { surface: "beta" }));
  }

  const legacyHref = getBetaNoticeLegacyHref(slug);

  return (
    <main
      id="main-content"
      data-beta-ui
      className="beta-ledger-grid min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5"
    >
      <div className="mx-auto max-w-5xl">
        <Card className="beta-paper overflow-hidden border-border/60">
          <CardHeader className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full px-3 py-1 uppercase tracking-widest">
                Beta notice
              </Badge>
              <Badge variant="secondary" className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                /{slug.join("/")}
              </Badge>
            </div>
            <div className="space-y-3">
              <CardTitle className="font-heading text-6xl leading-none tracking-tight text-foreground">
                Route này chưa vào phase 1 của beta.
              </CardTitle>
              <p className="max-w-3xl text-base leading-8 text-muted-foreground">
                Bạn đang ở một bề mặt beta chưa được chuyển trọn. Để không mất flow, route vẫn có landing riêng và luôn kèm lối quay về route hiện tại tương ứng.
              </p>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_20rem]">
            <div className="rounded-4xl border border-border/60 bg-muted/35 p-5">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Wrench className="size-5" />
                </div>
                <div className="space-y-2 text-sm leading-7 text-muted-foreground">
                  <p>
                    Phase 1 chỉ bao phủ <strong className="text-foreground">login</strong>, <strong className="text-foreground">admin</strong> và <strong className="text-foreground">inventory</strong>. Các route còn lại hiện dùng notice page để giữ điều hướng nhất quán trong beta.
                  </p>
                  <p>
                    Khi cần thao tác thật, hãy mở route hiện tại bên dưới. Nếu bạn chỉ muốn tiếp tục khám phá beta, hub trung tâm vẫn luôn có sẵn.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Button asChild className="h-11 w-full rounded-2xl">
                <Link href={legacyHref}>
                  Mở route hiện tại
                  <ExternalLink className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-11 w-full rounded-2xl">
                <Link href="/beta">
                  Về beta hub
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
