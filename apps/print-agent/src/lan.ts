import net from "node:net";

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 750;

export interface SendOptions {
  timeoutMs?: number;
  maxAttempts?: number;
  backoffMs?: number;
}

/**
 * Transport failure that records whether any bytes were flushed to the
 * printer. `wrote=false` means the printer never received data (connect
 * timeout, refused, host unreachable) — safe to resend. `wrote=true` means
 * a resend could double-print a partially-sent ticket, so the caller must
 * NOT retry.
 */
class PrintTransportError extends Error {
  readonly wrote: boolean;
  constructor(message: string, wrote: boolean) {
    super(message);
    this.name = "PrintTransportError";
    this.wrote = wrote;
  }
}

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function sendRawLANOnce(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    let wrote = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      if (err) reject(new PrintTransportError(err.message, wrote));
      else resolve();
    };
    sock.setTimeout(timeoutMs, () =>
      done(new Error(`printer ${host}:${port} timed out after ${timeoutMs}ms`)),
    );
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(Buffer.from(bytes), (err) => {
        if (err) return done(err);
        // Bytes handed to the OS — past the point where a resend is safe.
        wrote = true;
        sock.end(() => done());
      });
    });
  });
}

/**
 * Send raw ESC/POS bytes to a LAN printer, retrying transient connect-phase
 * failures with linear backoff. A single brief LAN blip during a rush no
 * longer drops the ticket: the agent re-sends a few times before giving up.
 * Retries stop the moment any bytes reach the printer, so a half-sent ticket
 * is never duplicated.
 */
export async function sendRawLAN(
  host: string,
  port: number,
  bytes: Uint8Array,
  opts: SendOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = Math.max(1, opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const backoffMs = opts.backoffMs ?? DEFAULT_BACKOFF_MS;

  let lastError: Error | undefined;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await sendRawLANOnce(host, port, bytes, timeoutMs);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const retryable =
        err instanceof PrintTransportError ? !err.wrote : false;
      if (!retryable || attempt >= maxAttempts) break;
      await delay(backoffMs * attempt);
    }
  }

  const base = lastError?.message ?? "print failed";
  throw new Error(
    attempt > 1 ? `${base} (after ${String(attempt)} attempts)` : base,
  );
}
