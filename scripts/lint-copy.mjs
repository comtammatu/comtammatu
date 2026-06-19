import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const INCLUDE_DIRS = [
  "apps/web/app",
  "docs",
  "packages/shared/src/auth",
  "packages/shared/src/labels",
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
];

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
