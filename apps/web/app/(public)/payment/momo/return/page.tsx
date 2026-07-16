import Link from "next/link";
import { redirect } from "next/navigation";
import { messages } from "@lib/messages";
import { Button } from "@comtammatu/ui/components/button";
import { BrandLockup, BrandMascot } from "@/components/brand";

export default async function MomoReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const tableToken = typeof token === "string" ? token : null;
  if (tableToken && /^[A-Za-z0-9_-]{24,128}$/.test(tableToken)) {
    redirect(`/q/${encodeURIComponent(tableToken)}?momo=returned`);
  }

  const copy = messages.payment.momoReturn;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <BrandLockup decorative size="sm" priority />
        <BrandMascot decorative size="sm" />
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-xl font-semibold tracking-normal sm:text-2xl">
            {copy.title}
          </h1>
          <p className="text-sm text-muted-foreground">{copy.description}</p>
        </div>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">{copy.backToSystem}</Link>
        </Button>
      </section>
    </main>
  );
}
