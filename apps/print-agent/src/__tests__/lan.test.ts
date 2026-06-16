import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sendRawLAN } from "../lan.js";

const listen = (server: net.Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : 0);
    });
  });

const close = (server: net.Server): Promise<void> =>
  new Promise((resolve) => server.close(() => resolve()));

test("sends bytes once on a healthy printer, no retry", async () => {
  let connections = 0;
  const received: number[] = [];
  const server = net.createServer((sock) => {
    connections += 1;
    sock.on("data", (chunk) => received.push(...chunk));
    sock.on("end", () => sock.destroy());
  });
  const port = await listen(server);

  try {
    await sendRawLAN("127.0.0.1", port, new Uint8Array([1, 2, 3]), {
      maxAttempts: 3,
      backoffMs: 10,
      timeoutMs: 500,
    });
  } finally {
    await close(server);
  }

  assert.equal(connections, 1, "healthy send must not retry");
  assert.deepEqual(received, [1, 2, 3]);
});

test("retries a refused connection up to maxAttempts then reports attempt count", async () => {
  // Bind then immediately release a port to get one nothing is listening on.
  const probe = net.createServer();
  const port = await listen(probe);
  await close(probe);

  await assert.rejects(
    () =>
      sendRawLAN("127.0.0.1", port, new Uint8Array([9]), {
        maxAttempts: 3,
        backoffMs: 10,
        timeoutMs: 300,
      }),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /after 3 attempts/);
      return true;
    },
  );
});
