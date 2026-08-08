export interface VietQrBank {
  code: string;
  bin: string;
  name: string;
  shortName: string;
  transferSupported: boolean;
  lookupSupported: boolean;
}

type VietQrBanksParseResult =
  | { kind: "ok"; banks: VietQrBank[] }
  | { kind: "invalid" };

function readBoundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function readFlag(value: unknown): boolean {
  return value === 1 || value === true || value === "1";
}

export function parseVietQrBanks(payload: unknown): VietQrBanksParseResult {
  if (!payload || typeof payload !== "object") return { kind: "invalid" };

  const envelope = payload as Record<string, unknown>;
  if (envelope.code !== "00") return { kind: "invalid" };
  if (!Array.isArray(envelope.data)) return { kind: "invalid" };

  const banks: VietQrBank[] = [];
  for (const row of envelope.data) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const code = readBoundedText(item.code, 32)?.toUpperCase();
    const bin = readBoundedText(item.bin, 16);
    const name = readBoundedText(item.name, 200);
    const shortName =
      readBoundedText(item.shortName, 64) ??
      readBoundedText(item.short_name, 64) ??
      code;
    if (!code || !bin || !name || !shortName) continue;
    if (!/^\d{6}$/.test(bin)) continue;

    banks.push({
      code,
      bin,
      name,
      shortName,
      transferSupported: readFlag(item.transferSupported ?? item.isTransfer),
      lookupSupported: readFlag(item.lookupSupported),
    });
  }

  if (banks.length === 0) return { kind: "invalid" };
  return { kind: "ok", banks };
}

export function transferCapableBanks(banks: readonly VietQrBank[]): VietQrBank[] {
  return banks.filter((bank) => bank.transferSupported);
}

export function findVietQrBank(
  banks: readonly VietQrBank[],
  bankCodeOrBin: string,
): VietQrBank | null {
  const key = bankCodeOrBin.trim().toUpperCase();
  if (!key) return null;
  return (
    banks.find((bank) => bank.code === key || bank.bin === key) ?? null
  );
}
