import { usb, findByIds, OutEndpoint } from "usb";

const parseHex = (s: string | null | undefined): number | null => {
  if (!s) return null;
  const cleaned = s.trim().replace(/^0x/i, "");
  const n = parseInt(cleaned, 16);
  return Number.isFinite(n) ? n : null;
};

export async function sendRawUSB(
  vendorIdHex: string,
  productIdHex: string | null,
  bytes: Uint8Array,
  timeoutMs = 5000,
): Promise<void> {
  const vid = parseHex(vendorIdHex);
  const pid = parseHex(productIdHex);
  if (vid === null) {
    throw new Error(`invalid USB vendor_id: ${vendorIdHex}`);
  }

  const device = pid !== null
    ? findByIds(vid, pid)
    : usb.getDeviceList().find((d) => d.deviceDescriptor.idVendor === vid);

  if (!device) {
    throw new Error(`USB printer not found (vid=0x${vid.toString(16)}${pid !== null ? `, pid=0x${pid.toString(16)}` : ""})`);
  }

  device.open();
  const iface = device.interface(0);
  if (!iface) {
    device.close();
    throw new Error("USB printer has no interface 0");
  }

  const wasKernelAttached =
    typeof iface.isKernelDriverActive === "function" && iface.isKernelDriverActive();
  if (wasKernelAttached) {
    try { iface.detachKernelDriver(); } catch { /* ignore — Windows */ }
  }

  try {
    iface.claim();

    const outEndpoint = iface.endpoints.find(
      (ep): ep is OutEndpoint => ep instanceof OutEndpoint,
    );
    if (!outEndpoint) {
      throw new Error("USB printer has no OUT endpoint");
    }

    outEndpoint.timeout = timeoutMs;

    await new Promise<void>((resolve, reject) => {
      outEndpoint.transfer(Buffer.from(bytes), (err) =>
        err ? reject(err) : resolve(),
      );
    });
  } finally {
    try { iface.release(true, () => { /* noop */ }); } catch { /* ignore */ }
    if (wasKernelAttached) {
      try { iface.attachKernelDriver(); } catch { /* ignore */ }
    }
    try { device.close(); } catch { /* ignore */ }
  }
}
