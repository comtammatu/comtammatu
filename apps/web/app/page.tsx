import { redirect } from "next/navigation";
import { getDefaultRedirect } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";

export default async function RootPage() {
  const { claims } = await loadAuthState();
  redirect(getDefaultRedirect(claims));
}
