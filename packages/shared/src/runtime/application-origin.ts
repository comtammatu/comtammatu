/**
 * Shared trusted-origin resolution for cross-app links (app switcher and
 * work notification action URLs). Fail closed on any deviation: scheme,
 * credentials, port, path, search, hash, or lookalike hostname.
 */
export function resolveTrustedApplicationOrigin(
  raw: string,
  allowedHosts: readonly string[],
): string {
  if (allowedHosts.length === 0) {
    throw new Error("No trusted application origin is allowed");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Unsafe application origin: unparseable URL");
  }

  const isLocalhost = url.hostname === "localhost";
  const localhostPermitted =
    isLocalhost &&
    process.env.NODE_ENV !== "production" &&
    allowedHosts.includes("localhost");

  if (!isLocalhost) {
    if (url.protocol !== "https:") {
      throw new Error("Unsafe application origin: https is required");
    }
    if (url.port !== "") {
      throw new Error("Unsafe application origin: port is not allowed");
    }
  } else if (!localhostPermitted) {
    throw new Error("Unsafe application origin: localhost is not allowed");
  }

  // Exact hostname match rejects lookalikes such as
  // work.comtammatu.com.evil.example.
  if (!allowedHosts.includes(url.hostname)) {
    throw new Error("Unsafe application origin: hostname is not allowed");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("Unsafe application origin: credentials are not allowed");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Unsafe application origin: path is not allowed");
  }
  if (url.search !== "" || url.hash !== "") {
    throw new Error("Unsafe application origin: query/hash is not allowed");
  }

  return `${url.protocol}//${url.host}`;
}
