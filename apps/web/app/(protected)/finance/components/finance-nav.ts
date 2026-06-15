import {
  BarChart3 as IconBarChart3,
  Boxes as IconBoxes,
  FileSpreadsheet as IconFileSpreadsheet,
  FileText as IconFileText,
  Receipt as IconReceipt,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

// Finance deep nav as data (D019 § D): the finance-specific sidebar group
// appended under the shared office nav. Labels stay in the finance copy layer.
const financeNav = messages.finance.nav;

export function resolveFinanceNav({
  showInvoices,
  showSummary,
}: {
  showInvoices: boolean;
  showSummary: boolean;
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
          href: "/admin/reports/inventory-value",
          label: financeNav.items.inventoryValue,
          icon: IconBoxes,
        },
        {
          href: "/finance/food-cost",
          label: financeNav.items.grossProfit,
          icon: IconTrendingUp,
        },
        {
          href: "/finance/expenses",
          label: financeNav.items.expenses,
          icon: IconReceipt,
        },
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
    ...(showSummary
      ? [
          {
            href: "/finance/summary",
            label: financeNav.items.summary,
            icon: IconFileSpreadsheet,
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
