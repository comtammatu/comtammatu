const IMPORTED_UNIT_CODE_ALIASES: Readonly<Record<string, string>> = {
  bao: "sack",
  bịch: "pouch",
  bich: "pouch",
  cái: "piece",
  cai: "piece",
  can: "jerrycan",
  cây: "stick",
  cay: "stick",
  chai: "bottle",
  gói: "packet",
  goi: "packet",
  hộp: "box",
  hop: "box",
  hũ: "jar",
  hu: "jar",
  khay: "tray",
  lốc: "multipack",
  loc: "multipack",
  lon: "tin_can",
  ly: "cup",
  phần: "portion",
  phan: "portion",
  thùng: "case",
  thung: "case",
  trái: "fruit",
  trai: "fruit",
  túi: "bag",
  tui: "bag",
  vỉ: "blister_pack",
  vi: "blister_pack",
};

export function canonicalizeImportedUnitCode(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("vi-VN").normalize("NFC");
  return IMPORTED_UNIT_CODE_ALIASES[normalized] ?? normalized;
}
