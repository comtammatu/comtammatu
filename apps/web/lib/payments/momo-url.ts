const MOMO_GATEWAY_ORIGINS = new Set([
  "https://payment.momo.vn",
  "https://test-payment.momo.vn",
]);

function parseMomoUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (
      !MOMO_GATEWAY_ORIGINS.has(url.origin) ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function normalizeMomoGatewayBaseUrl(value: unknown): string | null {
  const url = parseMomoUrl(value);
  return url && url.pathname === "/" && !url.search ? url.origin : null;
}

export function normalizeMomoCheckoutUrl(value: unknown): string | null {
  const url = parseMomoUrl(value);
  const firstQueryKey = url?.searchParams.keys().next().value;
  if (
    !url ||
    url.pathname !== "/v2/gateway/pay" ||
    firstQueryKey !== "t" ||
    !url.searchParams.get("t")
  ) {
    return null;
  }
  return url.toString();
}
