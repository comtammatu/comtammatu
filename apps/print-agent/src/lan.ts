import net from "node:net";

export async function sendRawLAN(
  host: string,
  port: number,
  bytes: Uint8Array,
  timeoutMs = 5000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const sock = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        sock.destroy();
      } catch {
        /* ignore */
      }
      err ? reject(err) : resolve();
    };
    sock.setTimeout(timeoutMs, () =>
      done(new Error(`printer ${host}:${port} timed out after ${timeoutMs}ms`)),
    );
    sock.once("error", done);
    sock.connect(port, host, () => {
      sock.write(Buffer.from(bytes), (err) => {
        if (err) return done(err);
        sock.end(() => done());
      });
    });
  });
}
