import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolvePostLoginRedirect } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  resolveBranchHubContextFromHeaders,
  resolveCentralSiteHomeBranchId,
} from "@/_lib/branch-hub-device";

export default async function RootPage() {
  const { supabase, claims } = await loadAuthState();
  const headerStore = await headers();
  const branchHubContext = {
    ...resolveBranchHubContextFromHeaders(headerStore),
    homeBranchId: await resolveCentralSiteHomeBranchId(supabase, claims),
  };
  redirect(resolvePostLoginRedirect(claims, null, branchHubContext));
}
