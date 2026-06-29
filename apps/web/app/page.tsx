import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginRedirect } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchHubContextFromHeaders } from "@/_lib/branch-hub-device";

export default async function RootPage() {
  const { claims } = await loadAuthState();
  const headerStore = await headers();
  const branchHubContext = resolveBranchHubContextFromHeaders(headerStore);
  redirect(resolvePostLoginRedirect(claims, null, branchHubContext));
}
