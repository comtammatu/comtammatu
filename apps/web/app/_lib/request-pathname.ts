/**
 * Internal request pathname header. Proxy overwrites this from
 * `request.nextUrl.pathname` so layouts can skip staff auth for the public
 * pickup board without trusting a client-supplied header.
 */
export const REQUEST_PATHNAME_HEADER = "x-comtammatu-pathname";

export function readRequestPathname(headerStore: {
  get(name: string): string | null;
}): string {
  return headerStore.get(REQUEST_PATHNAME_HEADER)?.trim() ?? "";
}

export function withRequestPathname(
  request: Request,
  pathname: string,
): Headers {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_PATHNAME_HEADER, pathname);
  return requestHeaders;
}
