import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, ExternalLink, Wrench } from "lucide-react";
import { createClient } from "@comtammatu/database/supabase/server";
import { buildLoginBlockedStatePath, extractClaims } from "@comtammatu/shared/auth";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
    <main id="main-content" className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl p-4 md:p-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Beta notice</Badge>
              <Badge variant="outline">/{slug.join("/")}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="size-4" />
              <CardTitle>Route này chưa vào phase 1 của beta</CardTitle>
            </div>
            <CardDescription>
              Route vẫn có entry trong cây `/beta/*` để deep-link không bị đứt. Khi cần thao tác
              đầy đủ, bạn có thể quay về route hiện tại tương ứng.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href={legacyHref}
              className={buttonVariants({ variant: "default", size: "default" })}
            >
              Mở route hiện tại
              <ExternalLink className="size-4" />
            </Link>
            <Link href="/beta" className={buttonVariants({ variant: "outline", size: "default" })}>
              Về beta hub
              <ArrowUpRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
