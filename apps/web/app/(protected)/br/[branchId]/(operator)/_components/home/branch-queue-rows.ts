import {
  CalendarCheck,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  ShieldAlert,
  Truck,
} from "lucide-react";

export const QUEUE_ROW_KEYS = [
  "checkout-approvals",
  "waste-approvals",
  "count-slips",
  "leave-approvals",
  "inbound-transfers",
  "open-stock-requests",
] as const;

export type QueueRowKey = (typeof QUEUE_ROW_KEYS)[number];

export type QueueRow = {
  key: QueueRowKey;
  href: string;
  title: string;
  count: number;
  priority: "high" | "medium";
};

export const QUEUE_ROW_ICONS = {
  "checkout-approvals": ClipboardCheck,
  "waste-approvals": CheckCircle,
  "count-slips": ShieldAlert,
  "leave-approvals": CalendarCheck,
  "inbound-transfers": Truck,
  "open-stock-requests": ClipboardList,
} as const;
