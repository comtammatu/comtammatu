"use client";

import type { ReactNode } from "react";
import { Frame } from "@comtammatu/ui/components/frame";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";

function PosSkeletonPanel({ children }: { children: ReactNode }) {
  return (
    <Frame className="p-4 shadow-xs">
      <div className="flex flex-col gap-2">{children}</div>
    </Frame>
  );
}

function PosPageSkeletonFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          <div className="mb-3 flex shrink-0 gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <PosSkeletonPanel key={index}>
                <Skeleton className="mb-3 aspect-square w-full" />
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </PosSkeletonPanel>
            ))}
          </div>
        </div>
        <div className="hidden min-h-0 w-96 border-l border-border/60 p-3 xl:flex xl:flex-col">
          <Skeleton className="h-6 w-32" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <PosSkeletonPanel key={index}>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </PosSkeletonPanel>
            ))}
          </div>
          <Skeleton className="mt-auto h-12 w-full" />
        </div>
      </div>
    </div>
  );
}

function PosPageSkeletonFixture() {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">POS chi nhanh</p>
          <p className="text-sm text-muted-foreground">Ca dang mo</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="border px-3 py-1 text-sm">Tai ban</div>
          <Skeleton className="h-9 w-9" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          <div className="mb-3 flex shrink-0 gap-2">
            <div className="flex h-10 flex-1 items-center border px-3 text-sm">
              Tim mon
            </div>
            <div className="flex h-10 flex-1 items-center border px-3 text-sm">
              Danh muc
            </div>
          </div>
          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-hidden sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 12 }).map((_, index) => (
              <PosSkeletonPanel key={index}>
                <div className="mb-3 aspect-square w-full bg-muted" />
                <p className="truncate text-sm font-medium">Com tam suon</p>
                <p className="mt-2 text-sm text-muted-foreground">65.000 d</p>
              </PosSkeletonPanel>
            ))}
          </div>
        </div>
        <div className="hidden min-h-0 w-96 border-l border-border/60 p-3 xl:flex xl:flex-col">
          <p className="text-base font-semibold">Gio hang</p>
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <PosSkeletonPanel key={index}>
                <p className="text-sm font-medium">Mon dang chon</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  1 x 65.000 d
                </p>
              </PosSkeletonPanel>
            ))}
          </div>
          <div className="mt-auto h-12 bg-primary" />
        </div>
      </div>
    </div>
  );
}

export function PosPageSkeleton() {
  return (
    <AppBoneyardSkeleton
      name="pos-page-shell"
      loading
      className="flex min-h-0 flex-1 flex-col bg-background [&>div:first-child]:contents"
      fixture={<PosPageSkeletonFixture />}
      fallback={<PosPageSkeletonFallback />}
      snapshotConfig={{ excludeSelectors: ["svg"] }}
    >
      <PosPageSkeletonFixture />
    </AppBoneyardSkeleton>
  );
}
