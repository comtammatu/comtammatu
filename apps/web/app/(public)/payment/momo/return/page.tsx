import Link from "next/link";
import { messages } from "@lib/messages";
import { Button } from "@comtammatu/ui/components/button";

export default function MomoReturnPage() {
  const copy = messages.payment.momoReturn;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm space-y-4 text-center">
        <div className="space-y-2">
          <h1 className="font-heading text-2xl font-semibold tracking-normal">
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
