import {
  Ban,
  CalendarCheck,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  ShieldAlert,
  TriangleAlert,
  Truck,
} from "lucide-react";

export const QUEUE_ROW_KEYS = [
  "checkout-approvals",
  "waste-approvals",
  "count-slips",
  "leave-approvals",
  "inbound-transfers",
  "open-stock-requests",
  "void-approvals",
  "out-of-stock",
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
  "void-approvals": Ban,
  "out-of-stock": TriangleAlert,
} as const;
