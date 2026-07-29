import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();

const INCLUDE_DIRS = [
  "apps/web/app",
  "apps/web/lib",
  "apps/print-agent/src",
  "docs",
  "packages/print-render/src",
  "packages/shared/src/auth",
  "packages/shared/src/labels",
  "packages/shared/src/messages",
  "packages/ui/src",
];

const EXCLUDED_RELATIVE_PATHS = new Set([
  "docs/ref/glossary.md",
  "scripts/lint-copy.mjs",
]);

const EXCLUDED_PATH_SEGMENTS = new Set([
  ".next",
  ".turbo",
  "node_modules",
  "tmp",
]);

const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".md", ".html"]);
const VI_DIACRITIC_PATTERN = /[À-ỹ]/;
const TECHNICAL_UI_TERM_PATTERN =
  /(?:\b(?:override|fallback|qty|gate|matching|cold-chain|lock|acquire|cap|credit|tier|zone|snapshot|ticket|import|export|dashboard|yield|ad-hoc|template|online|offline|topping|blind|sku|inbox|tenant|grant|owner|agent|job|routing|webhook|provider|draft|mobile|checklist|quota|app|link|copy|order|ship|focus|sheet|top)\b|\bpeer\s+cross\b|\bpermission\s+key\b|\b(?:item_kind|provider_ref|tenant_id|branch_id|order_id|tax_invoice_id)\b|\bmigration\b|\bround\s+r\b|\bcận\s+date\b|\b(?:HRM|WAG)\b|\b(?:[A-Za-z][A-Za-z0-9_-]*\s+)?ID\b)/i;
const PURE_TECHNICAL_UI_COPY_PATTERN =
  /^(?:Owner|Checklist|Template|Self-Order|Feedback|Comming Soon|VAT|KPI|QC|HRM|WAG|Mobile|Draft|Top|Permission key|(?:Agent|Session|Payment|Item|Terminal|Station|Order|Branch|Job)\s+ID)[:.]?$/;
const UI_ACRONYM_ALLOWLIST = new Set([
  "POS",
  "KDS",
  "PO",
  "GRN",
  "WAC",
  "QR",
  "HĐĐT",
  "GTGT",
  "PIT",
  "AOV",
  "COGS",
  "PDF",
  "CSV",
  "VND",
  "NCC",
]);
const ALL_CAPS_UI_COPY_ALLOWLIST = new Set([
  "TIỆM CƠM TẤM",
  "MÁ TƯ",
  "QUÉT QR THANH TOÁN",
]);
const WRONG_ACRONYM_CASING_PATTERN =
  /\b(?:Vat|Kpi|Qr|Pos|Kds|Hđđt|Gtgt|Vietqr|Sepay)\b/;

const CHECKS = [
  { pattern: /\bEmployee Portal\b/g, replacement: "Cổng nhân viên" },
  { pattern: /\bAdmin Shell\b/g, replacement: "Khung quản trị" },
  { pattern: /\bProject Status\b/g, replacement: "Trạng thái dự án" },
  {
    pattern: /\bRestaurant Management System\b/g,
    replacement: "hệ thống quản lý vận hành nhà hàng",
  },
  { pattern: /\bPoint of Sale\b/g, replacement: "POS" },
  {
    pattern: /\bKitchen Display System\b/g,
    replacement: "KDS hoặc màn hình bếp",
  },
  {
    pattern: /\bHR\s*[/&]\s*Payroll\b/g,
    replacement: "Nhân sự & tiền lương",
  },
  { pattern: /\bBáo cáo CEO\b/g, replacement: "Báo cáo điều hành" },
  { pattern: /\bCEO lõi\b/g, replacement: "điều hành lõi" },
  { pattern: /\bAll Modules Shipped\b/g, replacement: "Toàn bộ phân hệ đã hoàn thành" },
  { pattern: /\bModule Progress\b/g, replacement: "Tiến độ phân hệ" },
  { pattern: /\bDependency Graph\b/g, replacement: "Sơ đồ phụ thuộc" },
  { pattern: /\bShipped\b/g, replacement: "Hoàn thành" },
  { pattern: /·\s*Point of Sale\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  {
    pattern: /·\s*Kitchen Display\b/g,
    replacement: "không dùng nhãn song ngữ kiểu này",
  },
  { pattern: /·\s*Stock\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  { pattern: /·\s*Finance\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  { pattern: /·\s*HR\s*\/\s*Payroll\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  { pattern: /·\s*Menu\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  { pattern: /·\s*Payment\b/g, replacement: "không dùng nhãn song ngữ kiểu này" },
  { pattern: /\bTBD\b/g, replacement: "ghi blocker thật hoặc xóa placeholder" },
  { pattern: /\bFIXME\b/g, replacement: "mở task thật hoặc sửa ngay" },
  { pattern: /\bpost-v1\b/gi, replacement: "không giữ backlog suy đoán trong docs sống" },
  { pattern: /\bwishlist\b/gi, replacement: "không giữ wishlist trong docs sống" },
  { pattern: /\bTelegram bot bridge\b/g, replacement: "Generic JSON POST" },
  { pattern: /\b(Ahamove|GrabFood|ShopeeFood|Baemin|ZaloPay|Zalo ZNS|SpeedSMS)\b/g, replacement: "chỉ ghi khi có D0xx/source-of-truth hiện hành" },
  { pattern: /\b(QR Self-Order|Advanced Analytics|Delivery dispatch)\b/g, replacement: "chỉ ghi khi có D0xx/source-of-truth hiện hành" },
  { pattern: /\b(Loyalty|Vouchers)\b/g, replacement: "chỉ ghi khi có D0xx/source-of-truth hiện hành" },
  { pattern: /submitLabel=["']Import["']/g, replacement: 'submitLabel="Nhập dữ liệu"' },
  { pattern: /Ghi chú[^"\n]*\bmatching\b/gi, replacement: "dùng “đối soát”" },
  { pattern: /Không tải được dashboard/gi, replacement: "dùng “tổng quan”" },
  { pattern: /\bpeer\s+cross\b/gi, replacement: "đếm chéo" },
  {
    pattern: /Kiểm kê tháng\s*\(\s*blind\s*\)/gi,
    replacement: "Kiểm kê tháng · đếm mù",
  },
  {
    pattern: /Kiểm kê quý\s*\(\s*peer\s+cross\s*\)/gi,
    replacement: "Kiểm kê quý · đếm chéo",
  },
  {
    pattern: /Nhóm A\s*\(\s*top\s+80%\s*\)/gi,
    replacement: "Nhóm A · 80% giá trị",
  },
  {
    pattern: /Có đơn hàng\s*\(\s*PO\s*\)/g,
    replacement: "Có đơn đặt hàng",
  },
  { pattern: /\bThiếu PO\b/g, replacement: "Thiếu đơn đặt hàng" },
  { pattern: /\bDanh sách GRN\b/g, replacement: "Danh sách phiếu nhập" },
  { pattern: /\bMã GRN\b/g, replacement: "Mã phiếu nhập" },
  { pattern: /\bWO\s*\/\s*PXK\b/g, replacement: "Phiếu xuất kho" },
  {
    pattern: /Tải template\b/gi,
    replacement: "Tải mẫu",
  },
  {
    pattern: /Không tạo được template\b/gi,
    replacement: "Không tạo được mẫu",
  },
];

/** Phrase denylist that only applies to operator UI source (not docs). */
const UI_ONLY_CHECKS = [
  { pattern: /\bad-hoc\b/gi, replacement: "nhập thẳng / không theo đơn" },
  { pattern: /\b(?:VD|Vd)\s*:/g, replacement: "Ví dụ:" },
  { pattern: /\bTopping\b/g, replacement: "Món thêm" },
  {
    pattern: /["']Online["']/g,
    replacement: '"Đang kết nối"',
  },
  {
    pattern: /["']Offline["']/g,
    replacement: '"Mất kết nối"',
  },
];

function isUiCopyPath(relPath) {
  return (
    relPath.startsWith("apps/web/") ||
    relPath.startsWith("packages/shared/src/messages/") ||
    relPath.startsWith("packages/shared/src/labels/") ||
    relPath.startsWith("packages/ui/src/") ||
    relPath.startsWith("apps/print-agent/src/") ||
    relPath.startsWith("packages/print-render/src/")
  );
}

function isInteractiveUiCopyPath(relPath) {
  return (
    relPath.startsWith("apps/web/") ||
    relPath.startsWith("packages/shared/src/messages/") ||
    relPath.startsWith("packages/shared/src/labels/") ||
    relPath.startsWith("packages/ui/src/")
  );
}

function isTestOrFixturePath(relPath) {
  return /(?:^|\/)(?:__tests__|tests|fixtures)(?:\/|$)/.test(relPath);
}

const UI_BOUNDARY_CHECKS = [
  {
    pattern:
      /(?:[A-Z][A-Z0-9_]*|[\w$.]*labels)\s*\[\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*\]\s*\?\?\s*\1\b/gi,
    replacement: "dùng nhãn dự phòng an toàn, không trả lại mã thô",
  },
  {
    pattern:
      /(?:toast|notify)\.error\(\s*(?:error|err|upErr)\.message\b/g,
    replacement: "ghi lỗi vào log và hiển thị ERRORS_VI.fallback",
  },
  {
    pattern: /\{\s*error\.digest\b/g,
    replacement: "không hiển thị digest trên UI",
  },
];

/** Vietnamese operator copy must not embed technical acronyms in a sentence. */
const EMBEDDED_UI_ACRONYM_PATTERN = /\b(?:PO|GRN|WAC|QC|VAT|KPI)\b/;

function findEmbeddedUiAcronymCopy(text, relPath) {
  const sourceFile = ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches = [];

  function visit(node) {
    const isCopyNode =
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail ||
      node.kind === ts.SyntaxKind.JsxText;

    if (isCopyNode) {
      const value = "text" in node ? node.text : node.getText(sourceFile);
      if (
        VI_DIACRITIC_PATTERN.test(value) &&
        EMBEDDED_UI_ACRONYM_PATTERN.test(value)
      ) {
        matches.push({
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          value,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function findUiCasingDrift(text, relPath) {
  const sourceFile = ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches = [];

  function visit(node) {
    const isCopyNode =
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail ||
      node.kind === ts.SyntaxKind.JsxText;

    if (isCopyNode) {
      const value = "text" in node ? node.text : node.getText(sourceFile);
      const words = value.match(/[A-Za-zÀ-ỹĐđ]+/g) ?? [];
      const nonAcronymWords = words.filter(
        (word) => !UI_ACRONYM_ALLOWLIST.has(word),
      );
      const isAllCapsVietnamese =
        VI_DIACRITIC_PATTERN.test(value) &&
        !ALL_CAPS_UI_COPY_ALLOWLIST.has(value.trim()) &&
        nonAcronymWords.length >= 2 &&
        nonAcronymWords.every(
          (word) =>
            word === word.toLocaleUpperCase("vi-VN") &&
            word !== word.toLocaleLowerCase("vi-VN"),
        );

      if (WRONG_ACRONYM_CASING_PATTERN.test(value) || isAllCapsVietnamese) {
        matches.push({
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          value,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

function hasAllowedExtension(file) {
  return [...ALLOWED_EXTENSIONS].some((ext) => file.endsWith(ext));
}

function getLineNumber(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

function findTechnicalUiCopy(text, relPath) {
  const sourceFile = ts.createSourceFile(
    relPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    relPath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const matches = [];

  function visit(node) {
    const isCopyNode =
      ts.isStringLiteralLike(node) ||
      node.kind === ts.SyntaxKind.TemplateHead ||
      node.kind === ts.SyntaxKind.TemplateMiddle ||
      node.kind === ts.SyntaxKind.TemplateTail ||
      node.kind === ts.SyntaxKind.JsxText;

    if (isCopyNode) {
      const value = "text" in node ? node.text : node.getText(sourceFile);
      if (
        (VI_DIACRITIC_PATTERN.test(value) &&
          TECHNICAL_UI_TERM_PATTERN.test(value)) ||
        PURE_TECHNICAL_UI_COPY_PATTERN.test(value.trim())
      ) {
        matches.push({
          line:
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
              .line + 1,
          value,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return matches;
}

async function collectFiles(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absPath = join(dir, entry.name);
    const relPath = relative(ROOT, absPath);

    if (
      relPath &&
      relPath.split("/").some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment))
    ) {
      continue;
    }

    if (EXCLUDED_RELATIVE_PATHS.has(relPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectFiles(absPath, files);
      continue;
    }

    if (entry.isFile() && hasAllowedExtension(entry.name)) {
      files.push(absPath);
    }
  }

  return files;
}

function sanitizeText(relPath, text) {
  if (relPath.endsWith(".md")) {
    return text
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]+`/g, "");
  }

  return text;
}

async function main() {
  const files = [];

  for (const includeDir of INCLUDE_DIRS) {
    const absDir = join(ROOT, includeDir);
    const dirStat = await stat(absDir);
    if (dirStat.isDirectory()) {
      await collectFiles(absDir, files);
    }
  }

  const failures = [];

  for (const file of files) {
    const relPath = relative(ROOT, file);
    const raw = await readFile(file, "utf8");
    const text = sanitizeText(relPath, raw);

    for (const check of CHECKS) {
      const matches = [...text.matchAll(check.pattern)];
      for (const match of matches) {
        const index = match.index ?? 0;
        failures.push(
          `${relPath}:${getLineNumber(text, index)} — "${match[0]}" → ${check.replacement}`,
        );
      }
    }

    if (isUiCopyPath(relPath)) {
      for (const check of UI_ONLY_CHECKS) {
        const matches = [...text.matchAll(check.pattern)];
        for (const match of matches) {
          const index = match.index ?? 0;
          failures.push(
            `${relPath}:${getLineNumber(text, index)} — "${match[0]}" → ${check.replacement}`,
          );
        }
      }
    }

    if (
      (relPath.endsWith(".ts") || relPath.endsWith(".tsx")) &&
      !isTestOrFixturePath(relPath)
    ) {
      for (const match of findTechnicalUiCopy(text, relPath)) {
        failures.push(
          `${relPath}:${match.line} — "${match.value}" → dùng thuật ngữ tiếng Việt trên nội dung hiển thị`,
        );
      }
      for (const match of findEmbeddedUiAcronymCopy(text, relPath)) {
        failures.push(
          `${relPath}:${match.line} — "${match.value}" → dùng thuật ngữ tiếng Việt trong câu; acronym chỉ đứng riêng ở pill/badge`,
        );
      }
      if (isInteractiveUiCopyPath(relPath)) {
        for (const match of findUiCasingDrift(text, relPath)) {
          failures.push(
            `${relPath}:${match.line} — "${match.value}" → dùng sentence case và viết đúng tên riêng/chữ viết tắt`,
          );
        }
      }
      for (const check of UI_BOUNDARY_CHECKS) {
        const matches = [...text.matchAll(check.pattern)];
        for (const match of matches) {
          const index = match.index ?? 0;
          failures.push(
            `${relPath}:${getLineNumber(text, index)} — "${match[0]}" → ${check.replacement}`,
          );
        }
      }
    }
  }

  const unsafeFixture = await readFile(
    join(ROOT, "scripts/fixtures/lint-copy/unsafe-ui.tsx"),
    "utf8",
  );
  if (!findTechnicalUiCopy(unsafeFixture, "unsafe-ui.tsx").length) {
    failures.push(
      "lint-copy fixture không kích hoạt guard thuật ngữ kỹ thuật trên UI",
    );
  }
  const unsafeLoanwordFixture =
    'const copy = "Yield mặc định 1.0 (không hao hụt)";\n';
  if (!findTechnicalUiCopy(unsafeLoanwordFixture, "unsafe-loanword.tsx").length) {
    failures.push(
      "lint-copy fixture không kích hoạt guard loanword UI (Yield/template/…)",
    );
  }
  const unsafeAcronymSentence =
    'const copy = "Chọn PO để tạo GRN";\n';
  if (
    !findEmbeddedUiAcronymCopy(
      unsafeAcronymSentence,
      "unsafe-acronym.tsx",
    ).length
  ) {
    failures.push(
      "lint-copy fixture không kích hoạt guard acronym nhúng trong câu Việt",
    );
  }
  const unsafeCasingFixture =
    'const badAcronym = "Thuế Vat";\nconst allCaps = "YÊU CẦU HÀNG";\n';
  if (!findUiCasingDrift(unsafeCasingFixture, "unsafe-casing.tsx").length) {
    failures.push(
      "lint-copy fixture không kích hoạt guard viết hoa/viết thường trên UI",
    );
  }
  for (const check of UI_BOUNDARY_CHECKS) {
    if (![...unsafeFixture.matchAll(check.pattern)].length) {
      failures.push(`lint-copy fixture không kích hoạt guard: ${check.replacement}`);
    }
  }
  const safeFixture = await readFile(
    join(ROOT, "scripts/fixtures/lint-copy/safe-acronyms.tsx"),
    "utf8",
  );
  for (const check of [...CHECKS, ...UI_ONLY_CHECKS, ...UI_BOUNDARY_CHECKS]) {
    if ([...safeFixture.matchAll(check.pattern)].length) {
      failures.push(`lint-copy báo sai với fixture viết tắt hợp lệ: ${check.replacement}`);
    }
  }
  if (
    findTechnicalUiCopy(safeFixture, "safe-acronyms.tsx").length ||
    findEmbeddedUiAcronymCopy(safeFixture, "safe-acronyms.tsx").length ||
    findUiCasingDrift(safeFixture, "safe-acronyms.tsx").length
  ) {
    failures.push(
      "lint-copy báo sai với fixture acronym đứng riêng và viết hoa hợp lệ",
    );
  }

  if (failures.length > 0) {
    console.error("Copy lint phát hiện các cụm chưa chuẩn hóa:\n");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Copy lint: không phát hiện cụm drift bị cấm.");
}

await main();
