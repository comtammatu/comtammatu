import {
  BarChart3 as IconBarChart3,
  Boxes as IconBoxes,
  TrendingUp as IconTrendingUp,
  Wallet as IconWallet,
} from "lucide-react";
import type { ShellNavGroup } from "@/lib/shell-primitives";
import { messages } from "@lib/messages";

// Finance deep nav as data (D019 § D): the finance-specific sidebar group
// appended under the shared office nav. Labels stay in the finance copy layer.
const financeNav = messages.finance.nav;

export function resolveFinanceNav(): ShellNavGroup[] {
  return [
    {
      title: financeNav.groups.basic,
      items: [
        {
          href: "/finance",
          label: financeNav.items.todayMoney,
          icon: IconWallet,
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
      ],
    },
  ];
}
