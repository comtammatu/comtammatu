import {
  WORK_TASK_STATUSES,
  type WorkTaskStatusLabelKey,
} from "@lib/messages/work";

export const WORK_VIEWS = ["mine", "board", "calendar", "timeline"] as const;
export type WorkView = (typeof WORK_VIEWS)[number];

export type WorkSearchParams = {
  view?: string | string[];
  department?: string | string[];
  project?: string | string[];
  status?: string | string[];
  q?: string | string[];
  includeDone?: string | string[];
  month?: string | string[];
};

export type ParsedWorkParams = {
  view: WorkView;
  departmentId: number | null;
  projectId: number | null;
  status: WorkTaskStatusLabelKey | null;
  q: string | null;
  includeDone: boolean;
  month: string | null;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveInt(raw: string | undefined): number | null {
  if (!raw || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value > 0 ? value : null;
}

function parseView(raw: string | undefined): WorkView {
  if (raw && (WORK_VIEWS as readonly string[]).includes(raw)) {
    return raw as WorkView;
  }
  return "mine";
}

function parseStatus(raw: string | undefined): WorkTaskStatusLabelKey | null {
  if (!raw) return null;
  if ((WORK_TASK_STATUSES as readonly string[]).includes(raw)) {
    return raw as WorkTaskStatusLabelKey;
  }
  return null;
}

function parseQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 80);
}

function parseIncludeDone(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseMonth(raw: string | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function parseWorkParams(
  searchParams: WorkSearchParams | undefined,
): ParsedWorkParams {
  const params = searchParams ?? {};
  return {
    view: parseView(firstParam(params.view)),
    departmentId: parsePositiveInt(firstParam(params.department)),
    projectId: parsePositiveInt(firstParam(params.project)),
    status: parseStatus(firstParam(params.status)),
    q: parseQuery(firstParam(params.q)),
    includeDone: parseIncludeDone(firstParam(params.includeDone)),
    month: parseMonth(firstParam(params.month)),
  };
}

export function buildWorkSearchParams(
  current: ParsedWorkParams,
  patch: Partial<ParsedWorkParams>,
): URLSearchParams {
  const next: ParsedWorkParams = { ...current, ...patch };
  const qs = new URLSearchParams();

  if (next.view !== "mine") qs.set("view", next.view);
  if (next.departmentId != null) {
    qs.set("department", String(next.departmentId));
  }
  if (next.projectId != null) qs.set("project", String(next.projectId));
  if (next.status != null) qs.set("status", next.status);
  if (next.q != null) qs.set("q", next.q);
  if (next.includeDone) qs.set("includeDone", "1");
  if (next.month != null) qs.set("month", next.month);

  return qs;
}

export function workHref(
  current: ParsedWorkParams,
  patch: Partial<ParsedWorkParams>,
): string {
  const qs = buildWorkSearchParams(current, patch).toString();
  return qs ? `/work?${qs}` : "/work";
}
