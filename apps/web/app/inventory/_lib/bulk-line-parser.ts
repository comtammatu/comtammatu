export type NamedInventoryItem = {
  id: number;
  name: string;
};

export type ParsedBulkLine<TItem extends NamedInventoryItem> = {
  item: TItem;
  quantity: string;
  note: string;
};

export function normalizeInventoryLookupText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeInventoryNumberToken(
  input: string,
  maxFractionDigits = 3,
) {
  const cleaned = input.replace(/\s+/g, "").replace(/[^\d.,]/g, "");
  if (!cleaned) return "";

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  const separatorIndex = Math.max(commaIndex, dotIndex);

  if (separatorIndex < 0 || maxFractionDigits <= 0) {
    const integerOnly = cleaned.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
    return integerOnly || "0";
  }

  const digitsAfter = cleaned.slice(separatorIndex + 1).replace(/[^\d]/g, "");
  const hasDecimal =
    digitsAfter.length > 0 && digitsAfter.length <= maxFractionDigits;
  if (!hasDecimal) {
    const integerOnly = cleaned.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
    return integerOnly || "0";
  }

  const integerPart = cleaned
    .slice(0, separatorIndex)
    .replace(/[.,]/g, "")
    .replace(/^0+(?=\d)/, "");
  const fractionPart = digitsAfter.slice(0, maxFractionDigits);

  return `${integerPart || "0"}.${fractionPart}`;
}

export function findInventoryItemByName<TItem extends NamedInventoryItem>(
  value: string,
  items: readonly TItem[],
) {
  const needle = normalizeInventoryLookupText(value);
  if (!needle) {
    return { item: null, issue: "Thiếu tên nguyên liệu" };
  }

  const candidates = items.filter((item) => {
    const label = normalizeInventoryLookupText(item.name);
    return label === needle || label.includes(needle) || needle.includes(label);
  });

  if (candidates.length === 0) {
    return { item: null, issue: "Không khớp nguyên liệu" };
  }

  const exactCandidates = candidates.filter(
    (item) => normalizeInventoryLookupText(item.name) === needle,
  );
  if (exactCandidates.length === 1) {
    return { item: exactCandidates[0] ?? null, issue: null };
  }

  if (candidates.length === 1) {
    return { item: candidates[0] ?? null, issue: null };
  }

  return { item: null, issue: "Tên nguyên liệu chưa đủ rõ" };
}

export function cleanBulkLineNote(rest: string, unit: string) {
  const cleaned = rest.replace(/^[-–—:;,.\s]+/, "").trim();
  if (!cleaned) return "";

  const [firstToken = "", ...remaining] = cleaned.split(/\s+/);
  const firstTokenNorm = normalizeInventoryLookupText(firstToken);
  const unitNorm = normalizeInventoryLookupText(unit);
  if (firstTokenNorm && unitNorm && firstTokenNorm === unitNorm) {
    return remaining.join(" ").trim();
  }

  return cleaned;
}

export function parseInventoryBulkLines<TItem extends NamedInventoryItem>({
  text,
  items,
  getUnit,
}: {
  text: string;
  items: readonly TItem[];
  getUnit: (item: TItem) => string;
}) {
  const parsed: Array<ParsedBulkLine<TItem>> = [];
  const issues: string[] = [];
  const sourceLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  sourceLines.forEach((line, index) => {
    const quantityMatch = line.match(/\d[\d.,]*/);
    if (!quantityMatch || quantityMatch.index == null) {
      issues.push(`Dòng ${index + 1}: thiếu số lượng`);
      return;
    }

    const namePart = line.slice(0, quantityMatch.index).trim();
    const quantity = sanitizeInventoryNumberToken(quantityMatch[0], 3);
    if (!quantity || Number(quantity) <= 0) {
      issues.push(`Dòng ${index + 1}: số lượng chưa hợp lệ`);
      return;
    }

    const { item, issue } = findInventoryItemByName(namePart, items);
    if (!item || issue) {
      issues.push(`Dòng ${index + 1}: ${issue ?? "Không khớp nguyên liệu"}`);
      return;
    }

    parsed.push({
      item,
      quantity,
      note: cleanBulkLineNote(
        line.slice(quantityMatch.index + quantityMatch[0].length),
        getUnit(item),
      ),
    });
  });

  return { parsed, issues };
}
