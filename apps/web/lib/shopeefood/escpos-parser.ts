import type { ShopeeOrderRaw, ShopeeOrderItemRaw } from "./mapping";

/**
 * Strips ESC/POS binary commands from a Buffer or byte array and returns decoded text.
 * Handles standard ESC, GS, FS, DLE sequences, raster image data, and tabs/newlines.
 */
export function extractTextFromEscPos(buffer: Buffer | Uint8Array | string): string {
  if (typeof buffer === "string") {
    // If already string, strip non-printable ASCII control characters except \n, \r, \t
    let cleaned = "";
    for (let j = 0; j < buffer.length; j++) {
      const code = buffer.charCodeAt(j);
      if (code === 9 || code === 10 || code === 13 || code >= 32) {
        cleaned += buffer[j];
      }
    }
    return cleaned.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const textChunks: Buffer[] = [];
  let i = 0;

  while (i < bytes.length) {
    const b = bytes[i];

    if (b === undefined) break;

    // ESC commands (0x1B)
    if (b === 0x1b) {
      const next = bytes[i + 1];
      if (next === undefined) break;

      // 2-byte commands: ESC @, ESC E n, ESC M n, ESC a n, ESC d n, ESC ! n, ESC t n, etc.
      if (
        next === 0x40 || // ESC @ (Init)
        next === 0x32 || // ESC 2 (Default line spacing)
        next === 0x33 || // ESC 3 n
        next === 0x21 || // ESC ! n
        next === 0x45 || // ESC E n
        next === 0x47 || // ESC G n
        next === 0x4d || // ESC M n
        next === 0x61 || // ESC a n
        next === 0x64 || // ESC d n
        next === 0x74 || // ESC t n
        next === 0x70 || // ESC p m t1 t2
        next === 0x69 || // ESC i (Cut)
        next === 0x6d // ESC m (Cut)
      ) {
        if (next === 0x70) {
          i += 5; // ESC p m t1 t2
        } else if (next === 0x40 || next === 0x32 || next === 0x69 || next === 0x6d) {
          i += 2;
        } else {
          i += 3;
        }
        continue;
      }
      i += 2;
      continue;
    }

    // GS commands (0x1D)
    if (b === 0x1d) {
      const next = bytes[i + 1];
      if (next === undefined) break;

      // GS V m n (Cut paper)
      if (next === 0x56) {
        const m = bytes[i + 2];
        if (m === 0x41 || m === 0x42) i += 4;
        else i += 3;
        continue;
      }
      // GS ! n (Select char size)
      if (next === 0x21 || next === 0x42 || next === 0x61 || next === 0x77 || next === 0x48) {
        i += 3;
        continue;
      }
      // GS v 0 m xL xH yL yH d1...dk (Raster image)
      if (next === 0x76 && bytes[i + 2] === 0x30) {
        const xL = bytes[i + 4] || 0;
        const xH = bytes[i + 5] || 0;
        const yL = bytes[i + 6] || 0;
        const yH = bytes[i + 7] || 0;
        const xBytes = xL + xH * 256;
        const yRows = yL + yH * 256;
        const imgLen = xBytes * yRows;
        i += 8 + imgLen;
        continue;
      }
      // GS ( k (QR code / barcode)
      if (next === 0x28 && bytes[i + 2] === 0x6b) {
        const pL = bytes[i + 3] || 0;
        const pH = bytes[i + 4] || 0;
        const pLen = pL + pH * 256;
        i += 5 + pLen;
        continue;
      }
      // General GS fallback (skip 2 or 3 bytes)
      i += 3;
      continue;
    }

    // FS commands (0x1C)
    if (b === 0x1c) {
      i += 2;
      continue;
    }

    // Printable characters, tabs, or newlines
    if (b === 0x0a || b === 0x0d || b === 0x09 || b >= 0x20) {
      let chunkEnd = i;
      while (
        chunkEnd < bytes.length &&
        bytes[chunkEnd] !== 0x1b &&
        bytes[chunkEnd] !== 0x1d &&
        bytes[chunkEnd] !== 0x1c
      ) {
        chunkEnd++;
      }
      textChunks.push(bytes.subarray(i, chunkEnd));
      i = chunkEnd;
      continue;
    }

    i++;
  }

  const rawDecoded = Buffer.concat(textChunks).toString("utf-8");
  return rawDecoded.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function parsePriceNumber(raw: string | undefined): number {
  if (!raw) return 0;
  const digits = raw.replace(/[^\d]/g, "");
  return parseInt(digits, 10) || 0;
}

/**
 * Parses receipt text (from Shopee Partner thermal printout) into a structured ShopeeOrderRaw object.
 */
export function parseShopeeReceiptText(receiptText: string): ShopeeOrderRaw {
  const lines = receiptText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let displayId = "";
  let orderId = "";
  let customerName = "Khách ShopeeFood";
  let customerPhone = "";
  let customerNote = "";
  let needCutlery: boolean | number = true;
  let paymentMethod = "ShopeePay";
  let totalAmount = 0;
  let subtotal = 0;

  const rawItems: ShopeeOrderItemRaw[] = [];
  let currentItem: ShopeeOrderItemRaw | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;

    // 1. Order Code / Display ID: SPF-xxx or 260825-xxxx or Mã đơn / Đơn hàng
    const spfMatch = line.match(/\b(SPF[-_]?[0-9A-Z]+)\b/i);
    if (spfMatch && spfMatch[1]) {
      displayId = spfMatch[1].toUpperCase().replace("_", "-");
      if (!orderId) orderId = displayId;
    }

    const orderIdMatch = line.match(/(?:mã\s*đơn|đơn\s*hàng|order\s*id|mã\s*đặt\s*món)[:\s#]*([A-Z0-9_-]+)/i);
    if (orderIdMatch && orderIdMatch[1]) {
      const code = orderIdMatch[1].trim();
      if (!displayId) displayId = code;
      if (!orderId) orderId = code;
    }

    const numericDateOrderMatch = line.match(/\b(\d{6}-\d{6,})\b/);
    if (numericDateOrderMatch && numericDateOrderMatch[1]) {
      orderId = numericDateOrderMatch[1];
      if (!displayId) displayId = orderId;
    }

    // 2. Customer Name & Phone
    const nameMatch = line.match(/(?:khách\s*hàng|tên\s*khách|người\s*nhận|customer|buyer)[:\s]+([^(\d]+)/i);
    if (nameMatch && nameMatch[1]) {
      const parsedName = nameMatch[1].trim();
      if (parsedName.length > 1 && !parsedName.toLowerCase().includes("shopeefood")) {
        customerName = parsedName;
      }
    }

    const phoneMatch = line.match(/(?:sđt|điện\s*thoại|phone|tel)[:\s]*([0-9+\s]{9,15})/i) ||
      line.match(/\b(0\d{9,10}|\+84\d{9,10})\b/);
    if (phoneMatch && phoneMatch[1]) {
      customerPhone = phoneMatch[1].replace(/\s+/g, "").trim();
    }

    // 3. Cutlery / Dụng cụ ăn uống
    if (/không\s*(?:lấy\s*)?(?:dụng\s*cụ|muỗng|đũa|dao|nĩa)|ko\s*lấy\s*muỗng/i.test(line)) {
      needCutlery = false;
    } else if (/(?:lấy|cần)\s*(?:dụng\s*cụ|muỗng|đũa|hộp)|muỗng\s*đũa:\s*có/i.test(line)) {
      needCutlery = true;
    }

    // 4. Overall Order Note / Lời nhắn
    const noteMatch = line.match(/(?:ghi\s*chú\s*đơn|lời\s*nhắn|ghi\s*chú\s*của\s*khách|order\s*note)[:\s]+(.+)/i);
    if (noteMatch && noteMatch[1]) {
      customerNote = noteMatch[1].trim();
    }

    // 5. Payment Method
    if (/shopeepay|ví\s*điện\s*tử|airpay|thẻ|cashless/i.test(line)) {
      paymentMethod = "ShopeePay";
    } else if (/tiền\s*mặt|cash\b|thu\s*tiền\s*mặt/i.test(line)) {
      paymentMethod = "Tiền mặt";
    }

    // 6. Subtotal & Total
    const subtotalMatch = line.match(/(?:tạm\s*tính|tiền\s*món|tổng\s*tiền\s*món|subtotal)[:\s]*([\d.,]+)\s*(?:đ|vnd)?/i);
    if (subtotalMatch && subtotalMatch[1]) {
      subtotal = parsePriceNumber(subtotalMatch[1]);
    }

    const totalMatch = line.match(/(?:tổng\s*cộng|tổng\s*thanh\s*toán|thành\s*tiền|tổng\s*tiền|tổng\s*đơn|grand\s*total|total)[:\s]*([\d.,]+)\s*(?:đ|vnd)?/i);
    if (totalMatch && totalMatch[1]) {
      totalAmount = parsePriceNumber(totalMatch[1]);
    }

    // 7. Parse Line Items vs Side Items (Món thêm)
    // Side item line: Starts with +, -, *, >, or bracketed side prefix
    const isSideItemLine = /^[+\-*•>]\s*/.test(line) || /^\[(?:món thêm|tùy chọn)\]/i.test(line);

    if (isSideItemLine && currentItem) {
      const cleanSideText = line.replace(/^[+\-*•>]\s*/, "").replace(/^\[[^\]]+\]\s*/, "").trim();
      const sidePriceMatch = cleanSideText.match(/(?:x\s*(\d+)\s*)?[:\s]*([\d.,]+)\s*(?:đ|vnd)?$/i) ||
        cleanSideText.match(/\(([\d.,]+)\s*(?:đ|vnd)?\)/i);

      let sideName = cleanSideText;
      let sidePrice = 0;
      let sideQty = 1;

      if (sidePriceMatch) {
        if (sidePriceMatch[1] && !sidePriceMatch[2]) {
          sidePrice = parsePriceNumber(sidePriceMatch[1]);
          sideName = cleanSideText.replace(/\([^)]+\)/, "").trim();
        } else if (sidePriceMatch[2]) {
          sideQty = parseInt(sidePriceMatch[1] || "1", 10) || 1;
          sidePrice = parsePriceNumber(sidePriceMatch[2]);
          sideName = cleanSideText.replace(sidePriceMatch[0], "").trim();
        }
      }

      if (!currentItem.options) currentItem.options = [];
      currentItem.options.push({
        name: sideName,
        price: sidePrice,
        quantity: sideQty,
      });
      continue;
    }

    // Item Note Line
    const itemNoteMatch = line.match(/^(?:ghi\s*chú|note|lưu\s*ý)[:\s]+(.+)/i);
    if (itemNoteMatch && itemNoteMatch[1] && currentItem) {
      currentItem.note = itemNoteMatch[1].trim();
      continue;
    }

    // Line Item Matching Patterns
    // Pattern A: "2x Sườn Cốt Lết    126.000" or "2 x Sườn Cốt Lết    126.000"
    const itemPatternA = line.match(/^(\d+)\s*[xX*]\s*([^\d]+?)(?:\s+([\d.,]+)\s*(?:đ|vnd)?)?$/);
    // Pattern B: "Sườn Cốt Lết    x2    126.000" or "Sườn Cốt Lết    2x    126.000"
    const itemPatternB = line.match(/^([^\d]+?)\s+(?:[xX*]?\s*(\d+)\s*[xX*]?)\s+([\d.,]+)\s*(?:đ|vnd)?$/);
    // Pattern C: "1. Sườn Cốt Lết    63.000"
    const itemPatternC = line.match(/^\d+\.\s*([^\d]+?)(?:\s+([\d.,]+)\s*(?:đ|vnd)?)?$/);

    if (itemPatternA && itemPatternA[2]) {
      const qty = parseInt(itemPatternA[1] || "1", 10) || 1;
      const name = itemPatternA[2].trim();
      const price = parsePriceNumber(itemPatternA[3]);

      if (name.length > 1 && !/tổng|tạm tính|khuyến mãi|chiết khấu|phí/i.test(name)) {
        currentItem = {
          name,
          quantity: qty,
          price: price > 0 ? (price >= 1000 * qty ? Math.round(price / qty) : price) : 0,
          options: [],
        };
        rawItems.push(currentItem);
        continue;
      }
    } else if (itemPatternB && itemPatternB[1]) {
      const name = itemPatternB[1].trim();
      const qty = parseInt(itemPatternB[2] || "1", 10) || 1;
      const price = parsePriceNumber(itemPatternB[3]);

      if (name.length > 1 && !/tổng|tạm tính|khuyến mãi|chiết khấu|phí/i.test(name)) {
        currentItem = {
          name,
          quantity: qty,
          price: price > 0 ? (price >= 1000 * qty ? Math.round(price / qty) : price) : 0,
          options: [],
        };
        rawItems.push(currentItem);
        continue;
      }
    } else if (itemPatternC && itemPatternC[1]) {
      const name = itemPatternC[1].trim();
      const price = parsePriceNumber(itemPatternC[2]);

      if (name.length > 1 && !/tổng|tạm tính|khuyến mãi|chiết khấu|phí/i.test(name)) {
        currentItem = {
          name,
          quantity: 1,
          price,
          options: [],
        };
        rawItems.push(currentItem);
        continue;
      }
    }
  }

  // Fallback: Do NOT synthesize random IDs to preserve strict idempotency and deduplication
  if (!displayId && !orderId) {
    displayId = "";
    orderId = "";
  }

  return {
    orderId,
    orderCode: displayId,
    displayId,
    customer: {
      name: customerName,
      phone: customerPhone,
      note: customerNote,
    },
    items: rawItems,
    needCutlery,
    paymentMethod,
    subtotal: subtotal > 0 ? subtotal : totalAmount,
    total: totalAmount > 0 ? totalAmount : subtotal,
    note: customerNote || null,
  };
}

/**
 * Detects which delivery platform emitted the receipt based on header keywords,
 * order code prefix, and platform payment methods.
 */
export function detectDeliveryPlatform(receiptText: string): "shopee" | "grab" | "be" | "greensm" {
  // 1. Check ShopeeFood signatures
  if (
    /\b(?:ShopeeFood|ShopeePay|AirPay|DeliveryNow|Now\.vn)\b/i.test(receiptText) ||
    /\bSPF[-_]?[0-9A-Z]+\b/i.test(receiptText)
  ) {
    return "shopee";
  }

  // 2. Check GrabFood signatures
  if (
    /\b(?:GrabFood|GrabMerchant|GrabPay)\b/i.test(receiptText) ||
    /\bGF[-_]?[0-9A-Z]+\b/i.test(receiptText) ||
    /\bA-[0-9A-Z]{6,}\b/i.test(receiptText)
  ) {
    return "grab";
  }

  // 3. Check beFood signatures
  if (
    /\b(?:beFood|beMerchant|bePay|Cake by VPBank)\b/i.test(receiptText) ||
    /\b(?:BE|BF)-[0-9A-Z]+\b/i.test(receiptText)
  ) {
    return "be";
  }

  // 4. Check Green SM signatures
  if (
    /\b(?:Green\s*SM|Xanh\s*SM|GSM|XSM)\b/i.test(receiptText) ||
    /\b(?:GSM|XSM|XANH)-[0-9A-Z]+\b/i.test(receiptText)
  ) {
    return "greensm";
  }

  return "shopee";
}

/**
 * High-level parser that takes raw ESC/POS binary buffer or UTF-8 text and returns a ShopeeOrderRaw.
 */
export function parseShopeeEscPosStream(input: Buffer | Uint8Array | string): ShopeeOrderRaw {
  const text = extractTextFromEscPos(input);
  return parseShopeeReceiptText(text);
}
