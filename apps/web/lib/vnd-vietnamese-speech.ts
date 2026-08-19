const ONES = [
  "không",
  "một",
  "hai",
  "ba",
  "bốn",
  "năm",
  "sáu",
  "bảy",
  "tám",
  "chín",
] as const;

export const OPERATIONAL_SPEECH_VND_STEP = 1_000;
export const OPERATIONAL_SPEECH_VND_MAX = 20_000_000;

function onesWord(n: number): string {
  return ONES[n] ?? "không";
}

function readGroup(n: number, scaleHasHigher: boolean): string[] {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;
  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;

  if (hundreds > 0) {
    parts.push(onesWord(hundreds), "trăm");
  } else if (scaleHasHigher && n > 0) {
    parts.push("không", "trăm");
  }

  if (tens === 0) {
    if (ones > 0) {
      if (hundreds > 0 || scaleHasHigher) {
        parts.push("linh", onesWord(ones));
      } else {
        parts.push(onesWord(ones));
      }
    }
  } else if (tens === 1) {
    parts.push("mười");
    if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(onesWord(ones));
  } else {
    parts.push(onesWord(tens), "mươi");
    if (ones === 1) parts.push("mốt");
    else if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(onesWord(ones));
  }

  return parts;
}

export function roundVndForSpeech(amountVnd: number): number | null {
  if (!Number.isFinite(amountVnd) || amountVnd <= 0) return null;
  const rounded =
    Math.round(amountVnd / OPERATIONAL_SPEECH_VND_STEP) *
    OPERATIONAL_SPEECH_VND_STEP;
  if (rounded > OPERATIONAL_SPEECH_VND_MAX) return null;
  return rounded;
}

export function formatVndAsVietnamese(amountVnd: number): string {
  if (amountVnd === 0) return "không đồng";
  const million = Math.floor(amountVnd / 1_000_000);
  const thousand = Math.floor((amountVnd % 1_000_000) / 1_000);
  const units = amountVnd % 1_000;
  const parts: string[] = [];
  if (million > 0) {
    parts.push(...readGroup(million, false), "triệu");
  }
  if (thousand > 0) {
    parts.push(...readGroup(thousand, million > 0), "nghìn");
  }
  if (units > 0) {
    parts.push(...readGroup(units, million > 0 || thousand > 0));
  }
  parts.push("đồng");
  return parts.join(" ");
}

export function buildReceivedAmountUtterance(
  amountVnd: number,
): string | null {
  const rounded = roundVndForSpeech(amountVnd);
  if (rounded === null) return null;
  return `Đã nhận ${formatVndAsVietnamese(rounded)}`;
}
