import {
  Briefcase,
  CalendarCheck,
  ChartBar,
  ChefHat,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Send,
  Settings,
  Truck,
  Undo2,
  Utensils,
} from "lucide-react";

const ICONS = {
  Briefcase,
  CalendarCheck,
  ChartBar,
  ChefHat,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  FileText,
  Hourglass,
  LayoutDashboard,
  ListChecks,
  Monitor,
  MonitorUp,
  Package,
  Send,
  Settings,
  Truck,
  Undo2,
  Utensils,
} as const;

export function resolveOperatorTileIcon(icon: string) {
  return ICONS[icon as keyof typeof ICONS] ?? Monitor;
}
