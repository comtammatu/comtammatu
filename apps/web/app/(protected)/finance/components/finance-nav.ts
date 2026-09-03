import {
  BarChart3 as IconBarChart3,
  FileCheck as IconFileCheck,
  FileText as IconFileText,
  HardHat as IconHardHat,
  Landmark as IconLandmark,
  Receipt as IconReceipt,
  Wrench as IconWrench,
  Target as IconTarget,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";
import { financeHref, type FinanceParams } from "../_lib/finance-params";

// Finance deep nav as data (D019 § D): the finance-specific sidebar group
// appended under the shared Owner surface nav. Labels stay in the finance copy layer.
const financeNav = messages.finance.nav;

/** Carry period/branch scope on nav clicks; keep bare `href` for active match. */
export function withFinanceNavScope(
  groups: ShellNavGroup[],
  params: FinanceParams,
): ShellNavGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => {
      // Targets own `?month=` — do not overwrite with finance period params.
      if (item.href === "/finance/targets") return item;
      const linkHref = financeHref(item.href, params);
      if (linkHref === item.href) return item;
      return { ...item, linkHref };
    }),
  }));
}

export function resolveFinanceNav({
  showInvoices,
  showSupplierPayables,
  showRevenueTargets = false,
}: {
  showInvoices: boolean;
  showSupplierPayables: boolean;
  showRevenueTargets?: boolean;
}): ShellNavGroup[] {
  const groups: ShellNavGroup[] = [
    {
      title: financeNav.groups.money,
      items: [
        {
          href: "/finance",
          label: financeNav.items.todayMoney,
          icon: IconWallet,
          exact: true,
        },
        {
          href: "/finance/bank-transactions",
          label: financeNav.items.bankTransactions,
          icon: IconLandmark,
        },
        {
          href: "/finance/expenses",
          label: financeNav.items.expenses,
          icon: IconReceipt,
        },
        {
          href: "/finance/equipment",
          label: financeNav.items.equipment,
          icon: IconWrench,
        },
        {
          href: "/finance/construction",
          label: financeNav.items.construction,
          icon: IconHardHat,
        },
      ],
    },
    {
      title: financeNav.groups.reports,
      items: [
        {
          href: "/finance/revenue",
          label: financeNav.items.revenue,
          icon: IconBarChart3,
        },
        {
          href: "/finance/food-cost",
          label: financeNav.items.foodCost,
          icon: IconTrendingUp,
        },
        ...(showRevenueTargets
          ? [
              {
                href: "/finance/targets",
                label: financeNav.items.revenueTargets,
                icon: IconTarget,
              },
            ]
          : []),
      ],
    },
  ];

  const documentItems: ShellNavGroup["items"] = [
    ...(showInvoices
      ? [
          {
            href: "/finance/invoices",
            label: financeNav.items.invoices,
            icon: IconFileText,
          },
        ]
      : []),
    ...(showSupplierPayables
      ? [
          {
            href: "/finance/supplier-invoices",
            label: financeNav.items.supplierPayables,
            icon: IconFileCheck,
          },
        ]
      : []),
  ];
  if (documentItems.length > 0) {
    groups.push({
      title: financeNav.groups.documents,
      items: documentItems,
    });
  }

  return groups;
}
