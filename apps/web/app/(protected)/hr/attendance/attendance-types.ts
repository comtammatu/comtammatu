import { z } from "zod";
import type { BranchOption } from "../_types";

export interface AttendanceRecord {
  id: number;
  branch_id: number | null;
  date: string;
  check_in: string | null;
  check_out: string | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  check_in_photo_path: string | null;
  status: string;
  note: string | null;
  checklist_template_id: number | null;
  employee_id: number;
  employees: {
    id: number;
    employee_code: string;
    profiles: { full_name: string } | null;
  } | null;
  shifts: { name: string; start_time: string; end_time: string } | null;
  shift_checklist_templates: { name: string } | null;
  attendance_checklist_items: {
    id: number;
    title: string;
    phase: string;
    done_definition: string;
    is_required: boolean;
    is_done: boolean;
    sort_order: number;
  }[];
}

export interface AttendanceSummaryRow {
  employee_id: number;
  employee_code: string;
  full_name: string;
  workdays: number;
  work_hours: number;
}

export type AttendanceView = "clock" | "summary" | "calendar";
export type CalendarScope = "all" | "attention";

const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Nhập ngày giờ hợp lệ.");

export const attendanceCorrectionSchema = z
  .object({
    checkIn: localDateTimeSchema,
    checkOut: z.union([localDateTimeSchema, z.literal("")]),
    reason: z.string().trim().min(5, "Lý do phải có ít nhất 5 ký tự."),
  })
  .refine(
    (values) =>
      values.checkOut === "" ||
      Date.parse(values.checkOut) > Date.parse(values.checkIn),
    { path: ["checkOut"], message: "Giờ ra phải sau giờ vào." },
  );

export type AttendanceCorrectionValues = z.infer<
  typeof attendanceCorrectionSchema
>;

export function toLocalDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

export interface AttendanceTableProps {
  branches: BranchOption[];
  initialBranchId?: number;
  initialBranchScope?: string;
  initialMonth?: string;
  initialView?: AttendanceView;
  initialDay?: string | null;
  initialEmployeeId?: number | null;
  initialCalendarScope?: CalendarScope;
  /** Preserve Owner IA tab (`today` / `timesheet`) across filter replaces. */
  urlTab?: string;
  /** Today tab: clock-only, hide month/view chrome. */
  todayMode?: boolean;
  routePath?: string;
  canForceClose?: boolean;
  canCorrect?: boolean;
}
