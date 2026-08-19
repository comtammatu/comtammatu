import type { ReactNode } from "react";
import { Suspense } from "react";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { PageSkeleton } from "@/components/page-skeleton";

export function CatalogPageShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <BranchOperatorPage title={title} hideHeaderOnMobile>
      <Suspense fallback={<PageSkeleton bare />}>{children}</Suspense>
    </BranchOperatorPage>
  );
}
