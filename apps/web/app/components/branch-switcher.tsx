"use client";

import { useRouter, usePathname } from "next/navigation";
import { BRANCH_VI } from "@comtammatu/shared/messages";
import { Combobox } from "@/components/form/combobox";
import type { BranchSwitcherOption } from "@/_lib/branch-scope";

interface BranchSwitcherProps {
  options: BranchSwitcherOption[];
  branchId?: number | null;
}

/**
 * Global branch switcher for the app shell. Hidden unless the user can reach
 * more than one branch (owner / multi-branch roles); single-branch users never
 * see it. On select, swaps the `[branchId]` segment of a branch-scoped path
 * (`/br/[branchId]/...`) to keep the same sub-page, otherwise opens the target
 * branch dashboard. Scope stays in the URL — never localStorage or context.
 */
export function BranchSwitcher({ options, branchId }: BranchSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (options.length <= 1) return null;

  function handleChange(value: string) {
    const nextId = Number(value);
    if (!Number.isInteger(nextId) || nextId <= 0) return;

    const branchScoped = pathname.match(/^\/br\/\d+(\/.*)?$/);
    if (branchScoped) {
      const subPath = branchScoped[1] ?? "/dashboard";
      router.push(`/br/${String(nextId)}${subPath}`);
      return;
    }

    router.push(`/br/${String(nextId)}/dashboard`);
  }

  return (
    <Combobox
      value={branchId != null ? String(branchId) : ""}
      onValueChange={handleChange}
      options={options.map((branch) => ({
        value: String(branch.id),
        label: branch.name,
      }))}
      placeholder={BRANCH_VI.select}
      searchPlaceholder={BRANCH_VI.select}
      aria-label={BRANCH_VI.scope}
      triggerClassName="h-8"
    />
  );
}
