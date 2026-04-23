"use client"

import { useCallback, useTransition } from "react"
import type { ActionResult } from "@comtammatu/shared/types"
import {
  handleActionResult,
  type HandleOptions,
} from "./handle-action-result"

/**
 * Hook bọc `useTransition` + `handleActionResult` cho Server Actions trả về
 * `ActionResult<T>`. Gom boilerplate: isPending + toast + callback.
 *
 * ```tsx
 * const { run: approve, isPending } = useAction(approveGrnAction);
 * approve([grnId], { successMsg: "Đã duyệt", onSuccess: () => router.refresh() });
 * ```
 */
export function useAction<TArgs extends unknown[], TData>(
  action: (...args: TArgs) => Promise<ActionResult<TData>>,
  defaults?: HandleOptions<TData>,
) {
  const [isPending, startTransition] = useTransition()

  const run = useCallback(
    (args: TArgs, override?: HandleOptions<TData>) => {
      startTransition(async () => {
        const result = await action(...args)
        handleActionResult(result, { ...defaults, ...override })
      })
    },
    [action, defaults],
  )

  return { run, isPending }
}
