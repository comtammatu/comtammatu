import type { BranchHubContext } from "@comtammatu/shared/auth";

type HeaderReader = {
  get(name: string): string | null;
};

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Tablet/i;

export function resolveBranchHubContextFromHeaders(
  headers: HeaderReader,
): BranchHubContext {
  const mobileHint = headers.get("sec-ch-ua-mobile");
  const userAgent = headers.get("user-agent") ?? "";

  return {
    standaloneStation: null,
    isDesktop:
      mobileHint === "?1" ? false : !MOBILE_USER_AGENT.test(userAgent),
  };
}
