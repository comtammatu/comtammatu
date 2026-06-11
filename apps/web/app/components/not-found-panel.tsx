import Link from "next/link";
import { ACTIONS_VI, ERRORS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { AppEmptyState } from "@/components/surface";

export function NotFoundPanel({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <AppEmptyState
      title={ERRORS_VI.pageNotFound}
      description={ERRORS_VI.pageNotFoundHint}
    >
      <Button asChild>
        <Link href={homeHref}>{ACTIONS_VI.goHome}</Link>
      </Button>
    </AppEmptyState>
  );
}
