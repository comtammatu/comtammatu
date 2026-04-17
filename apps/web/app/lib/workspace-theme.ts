export const WORKSPACE_THEMES = [
  "auth",
  "employee",
  "admin",
  "finance",
  "hr",
  "inventory",
] as const;

export type WorkspaceTheme = (typeof WORKSPACE_THEMES)[number];

/**
 * UX/UI rule:
 * Every top-level workspace must declare a visual signature so the system
 * does not collapse into one identical shell across every module.
 */
export function workspaceThemeProps(theme: WorkspaceTheme) {
  return {
    "data-workspace-theme": theme,
  } as const;
}
