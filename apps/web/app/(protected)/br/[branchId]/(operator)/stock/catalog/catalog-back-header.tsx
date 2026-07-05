import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

export function CatalogBackHeader({
  title,
  backHref,
}: {
  title: string;
  backHref?: string;
}) {
  const heading = (
    <h1 className="font-heading text-lg font-semibold tracking-tight">
      {title}
    </h1>
  );

  if (!backHref) {
    return <header className="flex items-center gap-2">{heading}</header>;
  }

  return (
    <header className="flex items-center gap-2">
      <Button
        asChild
        variant="ghost"
        size="icon-touch"
        aria-label={title}
        className="-ml-2 shrink-0 text-muted-foreground"
      >
        <Link href={backHref}>
          <IconArrowLeft />
        </Link>
      </Button>
      {heading}
    </header>
  );
}
