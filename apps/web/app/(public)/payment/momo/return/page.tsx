import Link from "next/link";
import { messages } from "@lib/messages";
import { Button } from "@comtammatu/ui/components/button";

export default function MomoReturnPage() {
  const copy = messages.payment.momoReturn;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="flex w-full max-w-sm flex-col gap-4 text-center">
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
