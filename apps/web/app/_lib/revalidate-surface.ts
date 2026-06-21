import { revalidatePath } from "next/cache";

export function revalidateSurfacePath(pathname: string): void {
  revalidatePath(pathname);
}
