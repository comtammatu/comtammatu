"use client";

import {
  Skeleton as BoneyardSkeleton,
  type SkeletonProps as BoneyardSkeletonProps,
} from "boneyard-js/react";

type AppBoneyardSkeletonProps = Omit<
  BoneyardSkeletonProps,
  "animate" | "color" | "darkColor"
>;

export function AppBoneyardSkeleton(props: AppBoneyardSkeletonProps) {
  return (
    <BoneyardSkeleton
      animate="pulse"
      color="var(--muted)"
      darkColor="var(--muted)"
      {...props}
    />
  );
}
