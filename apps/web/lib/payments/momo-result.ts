export type MomoResultDisposition = "success" | "pending" | "failure";

const MOMO_TERMINAL_FAILURE_CODES = new Set([
  98, 99, 1001, 1002, 1003, 1004, 1005, 1006, 1007, 1017, 1026, 1080, 1081,
  1088, 2019, 4001, 4002, 4100,
]);

export function classifyMomoResultCode(
  resultCode: number,
): MomoResultDisposition {
  if (resultCode === 0 || resultCode === 9000) return "success";
  if (MOMO_TERMINAL_FAILURE_CODES.has(resultCode)) return "failure";
  return "pending";
}
