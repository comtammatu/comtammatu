"use client";

import type { ReactNode } from "react";
import {
  EmptyState,
  type AppEmptyStateProps as CoreEmptyStateProps,
} from "@comtammatu/ui/surface/empty-state";
import { BrandSymbol, type BrandSymbolVariant } from "@/components/brand";

export type { AppEmptyStateMode } from "@comtammatu/ui/surface/empty-state";

export type AppEmptyStateProps = Omit<CoreEmptyStateProps, "symbol"> & {
  symbol?: BrandSymbolVariant;
};

export function AppEmptyState({
  symbol,
  ...props
}: AppEmptyStateProps) {
  const symbolNode: ReactNode = symbol ? (
    <BrandSymbol variant={symbol} size="lg" />
  ) : undefined;
  return <EmptyState symbol={symbolNode} {...props} />;
}
