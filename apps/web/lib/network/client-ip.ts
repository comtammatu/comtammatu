/**
 * Resolve the client's public IP address from a request's headers.
 *
 * Why this helper exists:
 *
 *   `request.headers.get("x-forwarded-for")?.split(",")[0]` — the leftmost
 *   X-Forwarded-For entry is the **client-claimed** value. An attacker can
 *   inject `X-Forwarded-For: 1.2.3.4` and that value lands at index 0.
 *   Vercel APPENDS the real connection IP rather than stripping the chain,
 *   so the real value is at the end, not the beginning.
 *
 * Resolution order:
 *
 *   1. `x-real-ip` — set by Vercel from the trusted TCP-layer source. Most
 *      reliable on Vercel-hosted deployments.
 *   2. Last entry of `x-forwarded-for` — the most-trusted hop in a multi-
 *      proxy chain. Used only when `x-real-ip` is absent (dev, custom proxy).
 *
 * Returns `null` when:
 *   - No usable IP found in any header.
 *   - Result is in a private range (RFC1918 v4 / RFC4193 v6 / loopback /
 *     link-local). A private IP arriving here means the proxy chain is
 *     misconfigured — fail closed rather than trust it.
 *
 * IPv6 brackets and `:port` suffixes are stripped.
 *
 * @see tasks/regressions.md POS-NETWORK-GATE-NEVER-TRUST-XFF-FIRST-HOP
 */
export function getClientIp(
  headers: Headers | { get(name: string): string | null },
): string | null {
  const realIp = headers.get("x-real-ip");
  if (realIp) {
    const candidate = normalizeIp(realIp);
    if (candidate && !isPrivateIp(candidate)) {
      return candidate;
    }
  }

  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const segments = xff
      .split(",")
      .map((s) => normalizeIp(s))
      .filter((s): s is string => s !== null);
    const last = segments[segments.length - 1];
    if (last && !isPrivateIp(last)) {
      return last;
    }
  }

  return null;
}

function normalizeIp(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // IPv6 with brackets: [::1]:443 → ::1
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) {
      return value.slice(1, end);
    }
    return null;
  }

  // IPv4 with optional :port suffix
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(value)) {
    return value.replace(/:\d+$/, "");
  }

  // Plain IPv6 (no brackets, no port)
  if (value.includes(":") && !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value;
  }

  // Plain IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    return value;
  }

  return null;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(".") && !ip.includes(":")) {
    return isPrivateIpv4(ip);
  }
  if (ip.includes(":")) {
    return isPrivateIpv6(ip);
  }
  return true;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4
    || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("::ffff:")) {
    return isPrivateIpv4(lower.slice("::ffff:".length));
  }
  return false;
}
