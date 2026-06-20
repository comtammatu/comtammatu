import { STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { AppPage, type AppPageProps } from "@/components/surface";

type PageSkeletonProps = {
  width?: AppPageProps["width"];
  density?: AppPageProps["density"];
  mobile?: boolean;
  toolbar?: boolean;
  blocks?: number;
  bare?: boolean;
};

export function PageSkeleton({
  width = "wide",
  density,
  mobile,
  toolbar = true,
  blocks = 2,
  bare = false,
}: PageSkeletonProps) {
  const content = (
    <>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-48 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {toolbar ? <Skeleton className="h-9 w-full" /> : null}
      {Array.from({ length: blocks }).map((_, index) => (
        <Skeleton key={index} className="h-48 w-full rounded-lg" />
      ))}
    </>
  );

  if (bare) {
    return <div className="flex w-full flex-col gap-4">{content}</div>;
  }

  return (
    <AppPage width={width} density={density} mobile={mobile}>
      {content}
    </AppPage>
  );
}

export function PageSpinner({
  label = STATES_VI.loading,
  fullScreen = false,
}: {
  label?: string;
  fullScreen?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-3 py-6",
        fullScreen && "min-h-dvh py-0",
      )}
    >
      <Spinner className="size-6" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
