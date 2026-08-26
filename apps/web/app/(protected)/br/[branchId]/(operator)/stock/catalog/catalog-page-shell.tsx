import type { ReactNode } from "react";
import { Suspense } from "react";
import { BranchOperatorPage } from "@lib/branch-operator/components/branch-operator-page";
import { PageSkeleton } from "@/components/page-skeleton";

export function CatalogPageShell({
  title,
  back,
  children,
}: {
  title: string;
  back?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BranchOperatorPage title={title} back={back}>
      <Suspense fallback={<PageSkeleton bare />}>{children}</Suspense>
    </BranchOperatorPage>
  );
}
