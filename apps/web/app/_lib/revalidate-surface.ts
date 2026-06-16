import { revalidatePath } from "next/cache";

function normalizeSurfacePath(pathname: string): string {
  if (pathname === "/beta") {
    return "/";
  }

  if (pathname.startsWith("/beta/")) {
    const stripped = pathname.slice("/beta".length);
    return stripped.length > 0 ? stripped : "/";
  }

  return pathname;
}

function getSurfaceTargets(pathname: string): string[] {
  const normalized = normalizeSurfacePath(pathname);
  const targets = new Set<string>([normalized]);

  if (normalized.startsWith("/admin") || normalized.startsWith("/inventory")) {
    targets.add(`/beta${normalized}`);
  }

  return [...targets];
}

export function revalidateSurfacePath(pathname: string): void {
  for (const target of getSurfaceTargets(pathname)) {
    revalidatePath(target);
  }
}
