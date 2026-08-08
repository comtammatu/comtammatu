import {
  parseVietQrBanks,
  transferCapableBanks,
  type VietQrBank,
} from "./banks";

const VIETQR_BANKS_URL = "https://api.vietqr.io/v2/banks";

export async function fetchVietQrBanks(): Promise<VietQrBank[]> {
  const response = await fetch(VIETQR_BANKS_URL, {
    next: { revalidate: 86_400 },
  });
  if (!response.ok) throw new Error("vietqr_banks_unavailable");

  const parsed = parseVietQrBanks(await response.json());
  if (parsed.kind === "invalid") {
    throw new Error("vietqr_banks_invalid_response");
  }
  return transferCapableBanks(parsed.banks);
}
