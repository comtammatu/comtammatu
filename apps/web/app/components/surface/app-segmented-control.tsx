"use client";

import Link from "next/link";
import {
  AppSegmentedControl as CoreSegmentedControl,
  type AppSegmentedControlProps,
  type AppSegmentedOption,
} from "@comtammatu/ui/surface/segmented-control";

export type { AppSegmentedControlProps, AppSegmentedOption };

export function AppSegmentedControl<T extends string = string>(
  props: AppSegmentedControlProps<T>,
) {
  return <CoreSegmentedControl linkComponent={Link} {...props} />;
}
