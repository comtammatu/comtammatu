import {
  BarChart3 as IconBarChart3,
  FileCheck as IconFileCheck,
  FileText as IconFileText,
  Landmark as IconLandmark,
  Receipt as IconReceipt,
  Target as IconTarget,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

// Finance deep nav as data (D019 § D): the finance-specific sidebar group
// appended under the shared Owner surface nav. Labels stay in the finance copy layer.
const financeNav = messages.finance.nav;

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
      title: financeNav.groups.basic,
      items: [
        {
          href: "/finance",
          label: financeNav.items.todayMoney,
          icon: IconWallet,
          exact: true,
        },
        {
          href: "/finance/revenue",
          label: financeNav.items.revenue,
          icon: IconBarChart3,
        },
        {
          href: "/finance/bank-transactions",
          label: financeNav.items.bankTransactions,
          icon: IconLandmark,
        },
        {
          href: "/finance/food-cost",
          label: financeNav.items.foodCost,
          icon: IconTrendingUp,
        },
        {
          href: "/finance/expenses",
          label: financeNav.items.expenses,
          icon: IconReceipt,
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

  const invoiceItems: ShellNavGroup["items"] = [
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
  if (invoiceItems.length > 0) {
    groups.push({
      title: financeNav.groups.invoices,
      items: invoiceItems,
    });
  }

  return groups;
}
